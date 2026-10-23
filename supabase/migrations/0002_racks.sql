-- Racks: like a GitHub repository, a rack (owner/name) is created explicitly with a description
-- before anything can be pushed to it. Each push adds a version to an existing rack.
-- The rack row is public.packages; a rack with latest_version null is an empty rack.

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

  insert into public.packages (owner_id, name, type, description, keywords, homepage, repository)
  values (actor, p_name, coalesce(p_type, 'skill'), left(btrim(p_description), 500),
          coalesce(array(select lower(btrim(k)) from unnest(p_keywords) k where btrim(k) <> '' limit 20), '{}'),
          nullif(btrim(p_homepage), ''), nullif(btrim(p_repository), ''))
  returning id into rack_id;
  select username into uname from public.profiles where id = actor;
  return jsonb_build_object('owner', uname, 'name', p_name, 'id', rack_id);
end $$;

-- Edit the rack's "About" details. Null arguments leave a field unchanged.
create or replace function public.update_rack(
  p_token text, p_owner text, p_name text, p_description text default null,
  p_keywords text[] default null, p_homepage text default null, p_repository text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if p_description is not null and btrim(p_description) = '' then raise exception 'description_required'; end if;
  update public.packages p set
    description = coalesce(left(btrim(p_description), 500), p.description),
    keywords    = case when p_keywords is null then p.keywords
                       else array(select lower(btrim(k)) from unnest(p_keywords) k where btrim(k) <> '' limit 20) end,
    homepage    = case when p_homepage is null then p.homepage else nullif(btrim(p_homepage), '') end,
    repository  = case when p_repository is null then p.repository else nullif(btrim(p_repository), '') end,
    updated_at  = now()
  from public.profiles pr
  where pr.id = actor and p.owner_id = actor and pr.username = p_owner and p.name = p_name;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('owner', p_owner, 'name', p_name);
end $$;

-- Pushing now requires an existing rack. The rack keeps its own description;
-- topics, homepage and repository are filled from the manifest only when the rack has none.
create or replace function public.publish_version(
  p_token text, p_name text, p_version text, p_meta jsonb, p_manifest jsonb,
  p_readme text, p_files jsonb, p_archive_b64 text, p_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; pkg public.packages; ver_id uuid; uname text; arch bytea;
begin
  actor := public.skihost_actor(p_token);
  if actor is null then raise exception 'auth_required'; end if;
  if p_name !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$' then raise exception 'invalid_name'; end if;
  if p_version !~ '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$' then raise exception 'invalid_version'; end if;
  arch := decode(p_archive_b64, 'base64');
  if length(arch) > 4 * 1024 * 1024 then raise exception 'archive_too_large'; end if;

  select * into pkg from public.packages where owner_id = actor and name = p_name for update;
  if not found then raise exception 'rack_not_found'; end if;
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
                            'first_version', pkg.latest_version is null, 'sha256', p_sha256, 'size', length(arch));
end $$;

-- Totals now distinguish racks (all) from packages (racks with at least one version).
create or replace function public.get_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'racks',      (select count(*) from public.packages),
    'packages',   (select count(*) from public.packages where latest_version is not null),
    'versions',   (select count(*) from public.package_versions),
    'downloads',  (select coalesce(sum(downloads), 0) from public.packages),
    'publishers', (select count(distinct owner_id) from public.packages),
    'types',      coalesce((select jsonb_object_agg(type, n) from
                    (select type, count(*) n from public.packages where latest_version is not null group by type) t), '{}'::jsonb)
  )
$$;
