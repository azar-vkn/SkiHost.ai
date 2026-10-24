-- Security hardening for the public launch. Backward compatible with the previous app code:
-- legacy functions (download_archive, save/get_a2a_task) keep working until 0006 revokes them.

-- ───────────── least privilege on tables ─────────────
-- RLS already blocks writes; removing the grants means a future policy mistake can't open them.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon, authenticated;
-- Profiles: only cosmetic fields are self-editable (username, role, onboarding go through functions).
grant update (display_name, bio, website) on public.profiles to authenticated;

-- ───────────── new columns ─────────────
alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin')),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists terms_accepted_at timestamptz;

-- Hide account-internal profile columns from the public key.
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, bio, website, avatar_url, created_at, role, suspended_at) on public.profiles to anon;
grant select (id, username, display_name, bio, website, avatar_url, created_at, role, suspended_at, user_id, onboarded) on public.profiles to authenticated;

alter table public.packages
  add column if not exists status text not null default 'active' check (status in ('active', 'quarantined')),
  add column if not exists status_reason text;

alter table public.package_versions
  add column if not exists yanked_at timestamptz,
  add column if not exists yank_reason text,
  add column if not exists risk_flags text[] not null default '{}';

alter table public.api_tokens add column if not exists expires_at timestamptz;
grant select (expires_at) on public.api_tokens to authenticated;

-- ───────────── new tables (no policies: only SECURITY DEFINER functions touch them) ─────────────
create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

create table if not exists public.server_secrets (
  id          integer primary key default 1 check (id = 1),
  secret_hash text not null,
  updated_at  timestamptz not null default now()
);
alter table public.server_secrets enable row level security;

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason      text not null check (reason in ('malware', 'secrets', 'spam', 'copyright', 'impersonation', 'other')),
  details     text,
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution  text,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;

-- ───────────── internal helpers ─────────────
create or replace function public._check_server_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from public.server_secrets where secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
$$;

-- Fixed-window counter; true while the key is within its limit.
create or replace function public._hit(p_key text, p_limit integer, p_window integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window); n integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, ws, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return n <= p_limit;
end $$;

create or replace function public._is_admin(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_actor and role = 'admin' and suspended_at is null)
$$;

-- Caller resolution: API token (unexpired, unrevoked) or Supabase session. Sessions of accounts with
-- two-factor auth must have completed it (aal2); suspended accounts can't act at all.
create or replace function public.skihost_actor(p_token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid; susp timestamptz;
begin
  if coalesce(p_token, '') <> '' then
    update public.api_tokens set last_used_at = now()
     where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
       and revoked_at is null and (expires_at is null or expires_at > now())
     returning profile_id into pid;
    if pid is null then raise exception 'invalid_token'; end if;
  elsif auth.uid() is not null then
    select id into pid from public.profiles where user_id = auth.uid();
    if pid is not null and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
       and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then
      raise exception 'mfa_required';
    end if;
  end if;
  if pid is not null then
    select suspended_at into susp from public.profiles where id = pid;
    if susp is not null then raise exception 'account_suspended'; end if;
  end if;
  return pid;
end $$;

revoke execute on function public._check_server_secret(text) from public, anon, authenticated;
revoke execute on function public._hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public._is_admin(uuid) from public, anon, authenticated;
revoke execute on function public.skihost_actor(text) from public, anon, authenticated;

-- ───────────── rate limiting entry points ─────────────
-- Per-IP limits: only the SkiHost server (holder of the server secret) may count, so nobody can
-- lock other people out by spending their IP's quota.
create or replace function public.consume_ip_quota(p_secret text, p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public._check_server_secret(p_secret) then raise exception 'forbidden'; end if;
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'invalid_request'; end if;
  return public._hit('ip:' || left(coalesce(p_key, ''), 200), p_limit, p_window_seconds);
end $$;

-- Per-account limits: keyed to the caller's own identity, so calling it can only spend your own quota.
create or replace function public.consume_actor_quota(p_token text, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'invalid_request'; end if;
  return public._hit('actor:' || actor || ':' || left(coalesce(p_bucket, ''), 40), p_limit, p_window_seconds);
end $$;

-- ───────────── tokens ─────────────
drop function if exists public.create_api_token(text);
create or replace function public.create_api_token(p_name text, p_expires_in_days integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pid uuid; tok text; tid uuid; exp timestamptz;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  pid := public.skihost_actor(null);   -- enforces two-factor and suspension
  if pid is null then raise exception 'auth_required'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'invalid_token_name'; end if;
  if (select count(*) from public.api_tokens where profile_id = pid and revoked_at is null) >= 50 then raise exception 'token_limit'; end if;
  if not public._hit('actor:' || pid || ':token', 30, 3600) then raise exception 'rate_limited'; end if;
  exp := case when p_expires_in_days is null then null else now() + make_interval(days => least(greatest(p_expires_in_days, 1), 3650)) end;
  tok := 'skh_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (profile_id, name, token_hash, prefix, expires_at)
  values (pid, left(btrim(p_name), 80), encode(sha256(convert_to(tok, 'UTF8')), 'hex'), left(tok, 12), exp)
  returning id into tid;
  return jsonb_build_object('id', tid, 'name', left(btrim(p_name), 80), 'token', tok, 'prefix', left(tok, 12), 'expires_at', exp);
end $$;

-- ───────────── racks & publishing (quotas, quarantine, risk flags) ─────────────
create or replace function public.create_rack(
  p_token text, p_name text, p_description text, p_type text default 'skill',
  p_keywords text[] default '{}', p_homepage text default null, p_repository text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; uname text; rack_id uuid;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if coalesce(p_name, '') !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$' then raise exception 'invalid_name'; end if;
  if coalesce(btrim(p_description), '') = '' then raise exception 'description_required'; end if;
  if coalesce(p_type, 'skill') not in ('skill','plugin','mcp-server','requirements','agent','prompt','workflow') then
    raise exception 'invalid_type';
  end if;
  if exists (select 1 from public.packages where owner_id = actor and name = p_name) then raise exception 'rack_exists'; end if;
  if (select count(*) from public.packages where owner_id = actor) >= 200 then raise exception 'rack_limit'; end if;
  if not public._hit('actor:' || actor || ':create_rack', 30, 3600) then raise exception 'rate_limited'; end if;

  insert into public.packages (owner_id, name, type, description, keywords, homepage, repository)
  values (actor, p_name, coalesce(p_type, 'skill'), left(btrim(p_description), 500),
          coalesce(array(select lower(btrim(k)) from unnest(p_keywords) k where btrim(k) <> '' limit 20), '{}'),
          nullif(btrim(p_homepage), ''), nullif(btrim(p_repository), ''))
  returning id into rack_id;
  select username into uname from public.profiles where id = actor;
  return jsonb_build_object('owner', uname, 'name', p_name, 'id', rack_id);
end $$;

drop function if exists public.publish_version(text, text, text, jsonb, jsonb, text, jsonb, text, text);
create or replace function public.publish_version(
  p_token text, p_name text, p_version text, p_meta jsonb, p_manifest jsonb,
  p_readme text, p_files jsonb, p_archive_b64 text, p_sha256 text, p_risk_flags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; pkg public.packages; ver_id uuid; uname text; arch bytea; used bigint;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if p_name !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$' then raise exception 'invalid_name'; end if;
  if p_version !~ '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$' then raise exception 'invalid_version'; end if;
  arch := decode(p_archive_b64, 'base64');
  if length(arch) > 4 * 1024 * 1024 then raise exception 'archive_too_large'; end if;

  select * into pkg from public.packages where owner_id = actor and name = p_name for update;
  if not found then raise exception 'rack_not_found'; end if;
  if pkg.status <> 'active' then raise exception 'rack_disabled'; end if;
  if exists (select 1 from public.package_versions where package_id = pkg.id and version = p_version) then
    raise exception 'version_exists';
  end if;
  if (select count(*) from public.package_versions where package_id = pkg.id) >= 1000 then raise exception 'version_limit'; end if;
  select coalesce(sum(v.size), 0) into used
    from public.package_versions v join public.packages p on p.id = v.package_id where p.owner_id = actor;
  if used + length(arch) > 250 * 1024 * 1024 then raise exception 'storage_quota_exceeded'; end if;
  if not public._hit('actor:' || actor || ':publish', 60, 3600) then raise exception 'rate_limited'; end if;

  insert into public.package_versions (package_id, version, manifest, readme, changelog, sha256, size, file_count, published_by, risk_flags)
  values (pkg.id, p_version, coalesce(p_manifest, '{}'::jsonb), p_readme, p_meta->>'changelog', p_sha256,
          length(arch), jsonb_array_length(coalesce(p_files, '[]'::jsonb)), actor, coalesce(p_risk_flags, '{}'))
  returning id into ver_id;
  insert into public.package_archives (version_id, data) values (ver_id, arch);
  insert into public.package_files (version_id, path, size, is_binary, content)
  select ver_id, f->>'path', (f->>'size')::int, coalesce((f->>'is_binary')::boolean, false), f->>'content'
    from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) f;

  if pkg.latest_version is null or public.semver_key(p_version) >= public.semver_key(pkg.latest_version) then
    update public.packages set
      latest_version = p_version,
      type        = coalesce(p_meta->>'type', type),
      keywords    = case when cardinality(keywords) = 0
                         then coalesce(array(select jsonb_array_elements_text(p_meta->'keywords')), '{}')
                         else keywords end,
      agents      = coalesce(array(select jsonb_array_elements_text(p_meta->'agents')), '{}'),
      category    = p_meta->>'category',
      license     = p_meta->>'license',
      homepage    = coalesce(homepage, p_meta->>'homepage'),
      repository  = coalesce(repository, p_meta->>'repository'),
      readme      = p_readme,
      updated_at  = now()
    where id = pkg.id;
  else
    update public.packages set updated_at = now() where id = pkg.id;
  end if;

  select username into uname from public.profiles where id = actor;
  return jsonb_build_object('owner', uname, 'name', p_name, 'version', p_version,
                            'first_version', pkg.latest_version is null, 'sha256', p_sha256, 'size', length(arch),
                            'risk_flags', coalesce(p_risk_flags, '{}'));
end $$;

create or replace function public.set_star(p_token text, p_owner text, p_name text, p_star boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; pkg_id uuid; total int;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if not public._hit('actor:' || actor || ':star', 120, 3600) then raise exception 'rate_limited'; end if;
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

-- Downloads go through the server only, so counts (which drive ranking) can't be inflated directly.
create or replace function public.download_archive_v2(p_secret text, p_owner text, p_name text, p_version text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not public._check_server_secret(p_secret) then raise exception 'forbidden'; end if;
  select p.id as package_id, p.type, p.status, v.id as version_id, v.version, v.sha256, v.size, v.manifest,
         v.yanked_at, v.yank_reason, v.risk_flags, a.data
    into r
    from public.packages p
    join public.profiles pr on pr.id = p.owner_id
    join public.package_versions v on v.package_id = p.id
    join public.package_archives a on a.version_id = v.id
   where pr.username = p_owner and p.name = p_name
     and v.version = coalesce(nullif(p_version, 'latest'), p.latest_version);
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'active' then raise exception 'rack_disabled'; end if;
  update public.packages set downloads = downloads + 1 where id = r.package_id;
  update public.package_versions set downloads = downloads + 1 where id = r.version_id;
  return jsonb_build_object('owner', p_owner, 'name', p_name, 'version', r.version, 'type', r.type,
                            'sha256', r.sha256, 'size', r.size, 'manifest', r.manifest,
                            'yanked', r.yanked_at is not null, 'yank_reason', r.yank_reason, 'risk_flags', r.risk_flags,
                            'data', encode(r.data, 'base64'));
end $$;

create or replace function public.save_a2a_task_v2(p_secret text, p_id text, p_context text, p_task jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public._check_server_secret(p_secret) then raise exception 'forbidden'; end if;
  insert into public.a2a_tasks (id, context_id, task) values (p_id, p_context, p_task)
  on conflict (id) do update set task = excluded.task;
  if random() < 0.01 then delete from public.a2a_tasks where created_at < now() - interval '7 days'; end if;
end $$;

create or replace function public.get_a2a_task_v2(p_secret text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._check_server_secret(p_secret) then raise exception 'forbidden'; end if;
  return (select task from public.a2a_tasks where id = p_id);
end $$;

-- Pull a bad version (or restore it). Exact installs of a yanked version still work, but "latest" moves
-- to the newest version that isn't yanked.
create or replace function public.yank_version(p_token text, p_owner text, p_name text, p_version text, p_reason text default null, p_yank boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; pkg public.packages; newest text;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  select p.* into pkg from public.packages p join public.profiles pr on pr.id = p.owner_id
   where pr.username = p_owner and p.name = p_name and (p.owner_id = actor or public._is_admin(actor));
  if not found then raise exception 'not_found'; end if;
  update public.package_versions
     set yanked_at = case when p_yank then now() else null end,
         yank_reason = case when p_yank then left(nullif(btrim(p_reason), ''), 500) else null end
   where package_id = pkg.id and version = p_version;
  if not found then raise exception 'not_found'; end if;
  select version into newest from public.package_versions
   where package_id = pkg.id and yanked_at is null order by public.semver_key(version) desc limit 1;
  update public.packages set
    latest_version = newest,
    readme = coalesce((select readme from public.package_versions where package_id = pkg.id and version = newest), readme),
    updated_at = now()
  where id = pkg.id;
  return jsonb_build_object('version', p_version, 'yanked', p_yank, 'latest_version', newest);
end $$;

-- ───────────── search hides disabled racks ─────────────
create or replace function public.search_packages(
  p_query text default null, p_type text default null, p_owner text default null,
  p_sort text default 'relevance', p_limit int default 20, p_offset int default 0
) returns table (
  owner text, name text, type text, description text, keywords text[], agents text[], category text,
  latest_version text, downloads bigint, stars int, updated_at timestamptz, created_at timestamptz,
  rank real, total bigint
) language sql stable set search_path = '' as $$
  with input as (
    select nullif(btrim(left(coalesce(p_query, ''), 200)), '') as raw
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
       and p.status = 'active'
       and pr.suspended_at is null
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
  offset least(greatest(coalesce(p_offset, 0), 0), 10000)
$$;

-- ───────────── reports & moderation ─────────────
create or replace function public.report_package(p_token text, p_owner text, p_name text, p_reason text, p_details text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; pkg_id uuid; rid uuid;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if p_reason not in ('malware', 'secrets', 'spam', 'copyright', 'impersonation', 'other') then raise exception 'invalid_request'; end if;
  if not public._hit('actor:' || actor || ':report', 20, 86400) then raise exception 'rate_limited'; end if;
  select p.id into pkg_id from public.packages p join public.profiles pr on pr.id = p.owner_id
   where pr.username = p_owner and p.name = p_name;
  if pkg_id is null then raise exception 'not_found'; end if;
  select id into rid from public.reports where package_id = pkg_id and reporter_id = actor and status = 'open';
  if rid is null then
    insert into public.reports (package_id, reporter_id, reason, details)
    values (pkg_id, actor, p_reason, left(nullif(btrim(p_details), ''), 2000)) returning id into rid;
  else
    update public.reports set reason = p_reason, details = left(nullif(btrim(p_details), ''), 2000) where id = rid;
  end if;
  return jsonb_build_object('id', rid, 'status', 'open');
end $$;

create or replace function public.admin_list_reports(p_token text, p_status text default 'open')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if not public._is_admin(actor) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'resolution', r.resolution,
      'created_at', r.created_at, 'resolved_at', r.resolved_at,
      'reporter', rp.username, 'owner', op.username, 'name', p.name, 'rack_status', p.status,
      'owner_suspended', op.suspended_at is not null
    ) order by r.created_at desc)
    from public.reports r
    join public.packages p on p.id = r.package_id
    join public.profiles op on op.id = p.owner_id
    left join public.profiles rp on rp.id = r.reporter_id
    where p_status = 'all' or r.status = p_status
    limit 500
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(p_token text, p_id uuid, p_status text, p_resolution text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if not public._is_admin(actor) then raise exception 'forbidden'; end if;
  if p_status not in ('actioned', 'dismissed', 'open') then raise exception 'invalid_request'; end if;
  update public.reports set status = p_status, resolution = left(p_resolution, 2000),
         resolved_by = case when p_status = 'open' then null else actor end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_id;
end $$;

create or replace function public.admin_set_rack_status(p_token text, p_owner text, p_name text, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if not public._is_admin(actor) then raise exception 'forbidden'; end if;
  if p_status not in ('active', 'quarantined') then raise exception 'invalid_request'; end if;
  update public.packages p set status = p_status, status_reason = case when p_status = 'active' then null else left(p_reason, 500) end
    from public.profiles pr where pr.id = p.owner_id and pr.username = p_owner and p.name = p_name;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_delete_rack(p_token text, p_owner text, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if not public._is_admin(actor) then raise exception 'forbidden'; end if;
  delete from public.packages p using public.profiles pr where pr.id = p.owner_id and pr.username = p_owner and p.name = p_name;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_suspend_user(p_token text, p_username text, p_suspend boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid; target uuid;
begin
  actor := public.skihost_actor(p_token);
  if not public._is_admin(actor) then raise exception 'forbidden'; end if;
  select id into target from public.profiles where username = p_username;
  if target is null then raise exception 'not_found'; end if;
  if target = actor then raise exception 'invalid_request'; end if;
  update public.profiles set suspended_at = case when p_suspend then now() else null end,
         suspended_reason = case when p_suspend then left(p_reason, 500) else null end
   where id = target;
  if p_suspend then
    update public.api_tokens set revoked_at = now() where profile_id = target and revoked_at is null;
  end if;
end $$;

-- ───────────── accounts ─────────────
-- Deletes the caller's account and everything they own (racks, versions, tokens, stars).
create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare pid uuid; uname text;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  pid := public.skihost_actor(null);
  select username into uname from public.profiles where id = pid;
  if uname is null or p_confirm is distinct from uname then raise exception 'confirmation_mismatch'; end if;
  delete from auth.users where id = auth.uid();
end $$;

create or replace function public.complete_onboarding(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare me public.profiles; wanted text := lower(btrim(coalesce(p_username, '')));
begin
  select * into me from public.profiles where user_id = auth.uid();
  if me.id is null then raise exception 'auth_required'; end if;
  if wanted <> me.username then
    if wanted !~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$' or public.is_reserved_username(wanted) then
      raise exception 'invalid_username';
    end if;
    if exists (select 1 from public.profiles where username = wanted) then raise exception 'username_taken'; end if;
    if exists (select 1 from public.packages where owner_id = me.id) then raise exception 'has_racks'; end if;
    update public.profiles set username = wanted where id = me.id;
  end if;
  update public.profiles set onboarded = true, terms_accepted_at = coalesce(terms_accepted_at, now()) where id = me.id;
  return wanted;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uname text; chosen text;
begin
  chosen := nullif(new.raw_user_meta_data->>'username', '');
  uname := lower(coalesce(chosen, split_part(new.email, '@', 1), 'user'));
  uname := left(trim(both '-' from regexp_replace(uname, '[^a-z0-9-]+', '-', 'g')), 30);
  if uname = '' then uname := 'user'; end if;
  if public.is_reserved_username(uname) or exists (select 1 from public.profiles where username = uname) then
    uname := uname || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into public.profiles (user_id, username, display_name, avatar_url, onboarded, terms_accepted_at)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'name', ''), uname),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    chosen is not null,
    case when new.raw_user_meta_data->>'accepted_terms' = 'true' then now() end
  );
  return new;
end $$;

create or replace function public.is_reserved_username(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p in ('explore','new','login','signup','logout','settings','docs','agent','api','cli',
               'about','admin','search','packages','skills','auth','well-known','llms','install','skihost-app',
               'welcome','forgot-password','reset-password','racks','upload',
               'terms','privacy','security','mfa','status','health','report','reports','account','support','help')
$$;
