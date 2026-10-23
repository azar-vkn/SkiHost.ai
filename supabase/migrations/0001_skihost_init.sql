-- SkiHost registry schema.
-- The web app only ever talks to Supabase with the publishable key: reads go through
-- RLS "public read" policies, and every write goes through a SECURITY DEFINER function
-- that authenticates the caller either by Supabase Auth session or by a SkiHost API token.

-- ───────────────────────────── tables ─────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete cascade,
  username     text not null unique
               check (username ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'),
  display_name text,
  bio          text,
  website      text,
  created_at   timestamptz not null default now()
);

create table if not exists public.packages (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  name           text not null check (name ~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$'),
  type           text not null default 'skill'
                 check (type in ('skill','plugin','mcp-server','requirements','agent','prompt','workflow')),
  description    text not null default '',
  keywords       text[] not null default '{}',
  agents         text[] not null default '{}',
  category       text,
  license        text,
  homepage       text,
  repository     text,
  readme         text,
  latest_version text,
  downloads      bigint not null default 0,
  stars          integer not null default 0,
  search         tsvector,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, name)
);
create index if not exists packages_search_idx on public.packages using gin (search);
create index if not exists packages_downloads_idx on public.packages (downloads desc);
create index if not exists packages_updated_idx on public.packages (updated_at desc);

create table if not exists public.package_versions (
  id           uuid primary key default gen_random_uuid(),
  package_id   uuid not null references public.packages(id) on delete cascade,
  version      text not null,
  manifest     jsonb not null default '{}'::jsonb,
  readme       text,
  changelog    text,
  sha256       text not null,
  size         integer not null,
  file_count   integer not null default 0,
  downloads    bigint not null default 0,
  published_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (package_id, version)
);

-- Zip archives live apart from version rows so listing versions never drags blobs along.
create table if not exists public.package_archives (
  version_id uuid primary key references public.package_versions(id) on delete cascade,
  data       bytea not null
);

create table if not exists public.package_files (
  version_id uuid not null references public.package_versions(id) on delete cascade,
  path       text not null,
  size       integer not null,
  is_binary  boolean not null default false,
  content    text,
  primary key (version_id, path)
);

create table if not exists public.stars (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, package_id)
);

create table if not exists public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  prefix       text not null,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

create table if not exists public.a2a_tasks (
  id         text primary key,
  context_id text,
  task       jsonb not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── RLS ─────────────────────────────

alter table public.profiles         enable row level security;
alter table public.packages         enable row level security;
alter table public.package_versions enable row level security;
alter table public.package_archives enable row level security;
alter table public.package_files    enable row level security;
alter table public.stars            enable row level security;
alter table public.api_tokens       enable row level security;
alter table public.a2a_tasks        enable row level security;

drop policy if exists "public read" on public.profiles;
create policy "public read" on public.profiles for select using (true);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "public read" on public.packages;
create policy "public read" on public.packages for select using (true);
drop policy if exists "public read" on public.package_versions;
create policy "public read" on public.package_versions for select using (true);
drop policy if exists "public read" on public.package_files;
create policy "public read" on public.package_files for select using (true);
drop policy if exists "public read" on public.stars;
create policy "public read" on public.stars for select using (true);

drop policy if exists "own tokens" on public.api_tokens;
create policy "own tokens" on public.api_tokens for select
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- package_archives and a2a_tasks have no policies: only the functions below touch them.
-- token_hash never needs to leave the database, so only the other columns are readable.
revoke select on public.api_tokens from anon, authenticated;
grant select (id, profile_id, name, prefix, last_used_at, created_at, revoked_at) on public.api_tokens to authenticated;

-- ───────────────────────────── helpers ─────────────────────────────

create or replace function public.is_reserved_username(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p in ('explore','new','login','signup','logout','settings','docs','agent','api','cli',
               'about','admin','search','packages','skills','auth','well-known','llms','install','skihost-app')
$$;

create or replace function public.semver_key(v text)
returns int[] language sql immutable set search_path = '' as $$
  select array[
    split_part(split_part(v, '-', 1), '.', 1)::int,
    split_part(split_part(v, '-', 1), '.', 2)::int,
    split_part(split_part(v, '-', 1), '.', 3)::int,
    case when position('-' in v) > 0 then 0 else 1 end
  ]
$$;

create or replace function public.packages_search_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search :=
    setweight(to_tsvector('english', new.name || ' ' || translate(new.name, '-_.', '   ')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.keywords, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '') || ' ' || new.type || ' ' || coalesce(new.category, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(new.readme, ''), 20000)), 'D');
  return new;
end $$;

drop trigger if exists packages_search_trg on public.packages;
create trigger packages_search_trg before insert or update of name, keywords, description, type, category, readme
  on public.packages for each row execute function public.packages_search_update();

-- Every Supabase Auth sign-up gets a profile; the username comes from sign-up metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uname text;
begin
  uname := lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1), 'user'));
  uname := left(trim(both '-' from regexp_replace(uname, '[^a-z0-9-]+', '-', 'g')), 30);
  if uname = '' then uname := 'user'; end if;
  if public.is_reserved_username(uname) or exists (select 1 from public.profiles where username = uname) then
    uname := uname || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into public.profiles (user_id, username, display_name)
  values (new.id, uname, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Resolves the caller: an API token wins, otherwise the Supabase Auth session.
create or replace function public.skihost_actor(p_token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  if coalesce(p_token, '') <> '' then
    update public.api_tokens set last_used_at = now()
     where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and revoked_at is null
     returning profile_id into pid;
    if pid is null then raise exception 'invalid_token'; end if;
    return pid;
  end if;
  if auth.uid() is not null then
    select id into pid from public.profiles where user_id = auth.uid();
  end if;
  return pid;
end $$;

revoke execute on function public.skihost_actor(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.packages_search_update() from public, anon, authenticated;

-- ───────────────────────────── API functions ─────────────────────────────

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'
     and not public.is_reserved_username(p_username)
     and not exists (select 1 from public.profiles where username = p_username)
$$;

create or replace function public.whoami(p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; result jsonb;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then return null; end if;
  select jsonb_build_object('id', id, 'username', username, 'display_name', display_name, 'created_at', created_at)
    into result from public.profiles where id = actor;
  return result;
end $$;

create or replace function public.create_api_token(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pid uuid; tok text; tid uuid;
begin
  select id into pid from public.profiles where user_id = auth.uid();
  if pid is null then raise exception 'auth_required'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'invalid_token_name'; end if;
  tok := 'skh_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (profile_id, name, token_hash, prefix)
  values (pid, left(btrim(p_name), 80), encode(sha256(convert_to(tok, 'UTF8')), 'hex'), left(tok, 12))
  returning id into tid;
  return jsonb_build_object('id', tid, 'name', left(btrim(p_name), 80), 'token', tok, 'prefix', left(tok, 12));
end $$;

create or replace function public.revoke_api_token(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.api_tokens set revoked_at = now()
   where id = p_id and revoked_at is null
     and profile_id = (select id from public.profiles where user_id = auth.uid());
  return found;
end $$;

create or replace function public.publish_version(
  p_token text, p_name text, p_version text, p_meta jsonb, p_manifest jsonb,
  p_readme text, p_files jsonb, p_archive_b64 text, p_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; pkg public.packages; ver_id uuid; uname text; is_new boolean := false; arch bytea;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if p_name !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$' then raise exception 'invalid_name'; end if;
  if p_version !~ '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$' then raise exception 'invalid_version'; end if;
  arch := decode(p_archive_b64, 'base64');
  if length(arch) > 4 * 1024 * 1024 then raise exception 'archive_too_large'; end if;

  select * into pkg from public.packages where owner_id = actor and name = p_name for update;
  if not found then
    insert into public.packages (owner_id, name, type) values (actor, p_name, coalesce(p_meta->>'type', 'skill'))
    returning * into pkg;
    is_new := true;
  end if;
  if exists (select 1 from public.package_versions where package_id = pkg.id and version = p_version) then
    raise exception 'version_exists';
  end if;

  insert into public.package_versions (package_id, version, manifest, readme, changelog, sha256, size, file_count, published_by)
  values (pkg.id, p_version, coalesce(p_manifest, '{}'::jsonb), p_readme, p_meta->>'changelog', p_sha256,
          length(arch), jsonb_array_length(coalesce(p_files, '[]'::jsonb)), actor)
  returning id into ver_id;
  insert into public.package_archives (version_id, data) values (ver_id, arch);
  insert into public.package_files (version_id, path, size, is_binary, content)
  select ver_id, f->>'path', (f->>'size')::int, coalesce((f->>'is_binary')::boolean, false), f->>'content'
    from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) f;

  if pkg.latest_version is null or public.semver_key(p_version) >= public.semver_key(pkg.latest_version) then
    update public.packages set
      latest_version = p_version,
      type        = coalesce(p_meta->>'type', type),
      description = coalesce(p_meta->>'description', ''),
      keywords    = coalesce(array(select jsonb_array_elements_text(p_meta->'keywords')), '{}'),
      agents      = coalesce(array(select jsonb_array_elements_text(p_meta->'agents')), '{}'),
      category    = p_meta->>'category',
      license     = p_meta->>'license',
      homepage    = p_meta->>'homepage',
      repository  = p_meta->>'repository',
      readme      = p_readme,
      updated_at  = now()
    where id = pkg.id;
  else
    update public.packages set updated_at = now() where id = pkg.id;
  end if;

  select username into uname from public.profiles where id = actor;
  return jsonb_build_object('owner', uname, 'name', p_name, 'version', p_version, 'created', is_new,
                            'sha256', p_sha256, 'size', length(arch));
end $$;

create or replace function public.delete_package(p_token text, p_owner text, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  delete from public.packages p using public.profiles pr
   where p.owner_id = actor and pr.id = actor and pr.username = p_owner and p.name = p_name;
  if not found then raise exception 'not_found'; end if;
  return true;
end $$;

create or replace function public.download_archive(p_owner text, p_name text, p_version text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select p.id as package_id, p.type, v.id as version_id, v.version, v.sha256, v.size, v.manifest, a.data
    into r
    from public.packages p
    join public.profiles pr on pr.id = p.owner_id
    join public.package_versions v on v.package_id = p.id
    join public.package_archives a on a.version_id = v.id
   where pr.username = p_owner and p.name = p_name
     and v.version = coalesce(nullif(p_version, 'latest'), p.latest_version);
  if not found then raise exception 'not_found'; end if;
  update public.packages set downloads = downloads + 1 where id = r.package_id;
  update public.package_versions set downloads = downloads + 1 where id = r.version_id;
  return jsonb_build_object('owner', p_owner, 'name', p_name, 'version', r.version, 'type', r.type,
                            'sha256', r.sha256, 'size', r.size, 'manifest', r.manifest,
                            'data', encode(r.data, 'base64'));
end $$;

create or replace function public.set_star(p_token text, p_owner text, p_name text, p_star boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; pkg_id uuid; total int;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  select p.id into pkg_id from public.packages p join public.profiles pr on pr.id = p.owner_id
   where pr.username = p_owner and p.name = p_name;
  if pkg_id is null then raise exception 'not_found'; end if;
  if p_star then
    insert into public.stars (profile_id, package_id) values (actor, pkg_id) on conflict do nothing;
  else
    delete from public.stars where profile_id = actor and package_id = pkg_id;
  end if;
  select count(*) into total from public.stars where package_id = pkg_id;
  update public.packages set stars = total where id = pkg_id;
  return jsonb_build_object('starred', p_star, 'stars', total);
end $$;

create or replace function public.search_packages(
  p_query text default null, p_type text default null, p_owner text default null,
  p_sort text default 'relevance', p_limit int default 20, p_offset int default 0
) returns table (
  owner text, name text, type text, description text, keywords text[], agents text[], category text,
  latest_version text, downloads bigint, stars int, updated_at timestamptz, created_at timestamptz,
  rank real, total bigint
) language sql stable set search_path = '' as $$
  with input as (
    select nullif(btrim(coalesce(p_query, '')), '') as raw
  ), terms as (
    select string_agg(distinct w || ':*', ' | ') as expr
      from input, regexp_split_to_table(lower(coalesce(input.raw, '')), '[^a-z0-9]+') w
     where length(w) > 1
  ), qq as (
    select input.raw,
           case when terms.expr is null then null else to_tsquery('english', terms.expr) end as q
      from input, terms
  ), matched as (
    select pr.username as owner, p.name, p.type, p.description, p.keywords, p.agents, p.category,
           p.latest_version, p.downloads, p.stars, p.updated_at, p.created_at,
           (coalesce(ts_rank_cd(p.search, qq.q, 32), 0)
             + case when qq.raw is not null and p.name ilike '%' || qq.raw || '%' then 1 else 0 end
             + ln(1 + p.downloads) / 50.0)::real as rank
      from public.packages p
      join public.profiles pr on pr.id = p.owner_id
      cross join qq
     where p.latest_version is not null
       and (p_type is null or p.type = p_type)
       and (p_owner is null or pr.username = p_owner)
       and (qq.raw is null
            or (qq.q is not null and p.search @@ qq.q)
            or p.name ilike '%' || qq.raw || '%')
  )
  select m.*, count(*) over () as total
    from matched m
   order by
     case when p_sort = 'downloads' then m.downloads end desc nulls last,
     case when p_sort = 'stars' then m.stars end desc nulls last,
     case when p_sort = 'updated' then m.updated_at end desc nulls last,
     case when p_sort = 'new' then m.created_at end desc nulls last,
     m.rank desc, m.downloads desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.get_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'packages',   (select count(*) from public.packages where latest_version is not null),
    'versions',   (select count(*) from public.package_versions),
    'downloads',  (select coalesce(sum(downloads), 0) from public.packages),
    'publishers', (select count(distinct owner_id) from public.packages),
    'types',      coalesce((select jsonb_object_agg(type, n) from
                    (select type, count(*) n from public.packages where latest_version is not null group by type) t), '{}'::jsonb)
  )
$$;

create or replace function public.save_a2a_task(p_id text, p_context text, p_task jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.a2a_tasks (id, context_id, task) values (p_id, p_context, p_task)
  on conflict (id) do update set task = excluded.task
$$;

create or replace function public.get_a2a_task(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select task from public.a2a_tasks where id = p_id
$$;
