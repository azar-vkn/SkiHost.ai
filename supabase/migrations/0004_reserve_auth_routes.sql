-- New top-level pages (/welcome, /forgot-password, /reset-password, /auth/callback) can't be usernames.
create or replace function public.is_reserved_username(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p in ('explore','new','login','signup','logout','settings','docs','agent','api','cli',
               'about','admin','search','packages','skills','auth','well-known','llms','install','skihost-app',
               'welcome','forgot-password','reset-password','racks','upload')
$$;
