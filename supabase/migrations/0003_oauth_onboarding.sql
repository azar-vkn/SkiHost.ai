-- Google (OAuth) sign-ups arrive without a chosen username: the profile gets one derived from
-- the email, is marked not onboarded, and the user confirms or changes it once on /welcome.

alter table public.profiles add column if not exists onboarded boolean not null default true;
alter table public.profiles add column if not exists avatar_url text;

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
  insert into public.profiles (user_id, username, display_name, avatar_url, onboarded)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'name', ''), uname),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    chosen is not null
  );
  return new;
end $$;

-- Confirms (or changes) the username picked for an OAuth account. Renaming is only allowed
-- while the account owns no racks, because rack URLs and install ids contain the username.
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
  update public.profiles set onboarded = true where id = me.id;
  return wanted;
end $$;
