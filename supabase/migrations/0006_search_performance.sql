-- Search that stays fast at tens of thousands of racks:
--  * the ranked vector (`search`) holds only name, keywords, description, type and category;
--    README text moves to `search_body`, used for matching but not for (expensive) ranking;
--  * a trigram index serves "name contains" matches;
--  * browsing (no query) uses partial indexes instead of sorting every rack.
create extension if not exists pg_trgm with schema extensions;

alter table public.packages add column if not exists search_body tsvector;

create or replace function public.packages_search_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search :=
    setweight(to_tsvector('english', new.name || ' ' || translate(new.name, '-_.', '   ')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.keywords, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '') || ' ' || new.type || ' ' || coalesce(new.category, '')), 'B');
  new.search_body := to_tsvector('english', left(coalesce(new.readme, ''), 8000));
  return new;
end $$;

update public.packages set readme = readme;

create index if not exists packages_search_body_idx on public.packages using gin (search_body);
create index if not exists packages_name_trgm_idx on public.packages using gin (name extensions.gin_trgm_ops);
create index if not exists packages_listed_downloads_idx on public.packages (downloads desc) where latest_version is not null and status = 'active';
create index if not exists packages_listed_updated_idx on public.packages (updated_at desc) where latest_version is not null and status = 'active';
create index if not exists packages_listed_created_idx on public.packages (created_at desc) where latest_version is not null and status = 'active';
create index if not exists packages_listed_stars_idx on public.packages (stars desc) where latest_version is not null and status = 'active';
create index if not exists packages_owner_idx on public.packages (owner_id);

create or replace function public.search_packages(
  p_query text default null, p_type text default null, p_owner text default null,
  p_sort text default 'relevance', p_limit int default 20, p_offset int default 0
) returns table (
  owner text, name text, type text, description text, keywords text[], agents text[], category text,
  latest_version text, downloads bigint, stars int, updated_at timestamptz, created_at timestamptz,
  rank real, total bigint
) language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  raw text := nullif(btrim(left(coalesce(p_query, ''), 200)), '');
  pattern text;
  expr text;
  q tsquery;
  lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
  off int := least(greatest(coalesce(p_offset, 0), 0), 10000);
  sort_col text := case p_sort when 'stars' then 'stars' when 'updated' then 'updated_at' when 'new' then 'created_at' else 'downloads' end;
  owner_id uuid;
begin
  if p_owner is not null then
    select id into owner_id from public.profiles where username = p_owner;
    if owner_id is null then return; end if;
  end if;

  if raw is null then
    -- Browsing: walk a partial index in the requested order instead of ranking everything.
    return query execute format($q$
      select pr.username, p.name, p.type, p.description, p.keywords, p.agents, p.category, p.latest_version,
             p.downloads, p.stars, p.updated_at, p.created_at, 0::real,
             (select count(*) from public.packages c join public.profiles cp on cp.id = c.owner_id
               where c.latest_version is not null and c.status = 'active' and cp.suspended_at is null
                 and ($1 is null or c.type = $1) and ($2 is null or c.owner_id = $2))
        from public.packages p join public.profiles pr on pr.id = p.owner_id
       where p.latest_version is not null and p.status = 'active' and pr.suspended_at is null
         and ($1 is null or p.type = $1) and ($2 is null or p.owner_id = $2)
       order by p.%I desc, p.downloads desc
       limit $3 offset $4 $q$, sort_col)
      using p_type, owner_id, lim, off;
    return;
  end if;

  select string_agg(distinct w || ':*', ' | ') into expr
    from regexp_split_to_table(lower(raw), '[^a-z0-9]+') w where length(w) > 1;
  if expr is not null then q := to_tsquery('english', expr); end if;
  if q is not null and numnode(q) = 0 then q := null; end if;
  pattern := '%' || replace(replace(replace(raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    with matched as (
      select p.*
        from public.packages p
       where p.latest_version is not null and p.status = 'active'
         and (p_type is null or p.type = p_type)
         and (owner_id is null or p.owner_id = owner_id)
         and ((q is not null and (p.search @@ q or p.search_body @@ q)) or p.name ilike pattern)
    ), ranked as (
      select pr.username as owner, m.name, m.type, m.description, m.keywords, m.agents, m.category, m.latest_version,
             m.downloads, m.stars, m.updated_at, m.created_at,
             (case when q is null then 0 else ts_rank(m.search, q) end
               + case when m.name ilike pattern then 1 else 0 end
               + case when q is not null and m.search_body @@ q then 0.05 else 0 end
               + ln(1 + m.downloads) / 50.0)::real as rank
        from matched m join public.profiles pr on pr.id = m.owner_id
       where pr.suspended_at is null
    )
    select r.*, count(*) over () as total
      from ranked r
     order by
       case when p_sort = 'downloads' then r.downloads end desc nulls last,
       case when p_sort = 'stars' then r.stars end desc nulls last,
       case when p_sort = 'updated' then r.updated_at end desc nulls last,
       case when p_sort = 'new' then r.created_at end desc nulls last,
       r.rank desc, r.downloads desc
     limit lim offset off;
end $$;
