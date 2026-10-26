-- Users edit their display name, bio and website directly (column grant + "update own profile" policy),
-- so the limits the settings form shows are enforced here too.
update public.profiles set display_name = nullif(left(btrim(display_name), 60), '') where display_name is distinct from nullif(left(btrim(display_name), 60), '');
update public.profiles set bio = nullif(left(btrim(bio), 300), '') where bio is distinct from nullif(left(btrim(bio), 300), '');
update public.profiles set website = null where website is not null and (website !~* '^https?://[^\s]+$' or length(website) > 200);

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check
  check (display_name is null or (length(display_name) between 1 and 60 and display_name !~ '[\x00-\x1f\x7f]'));

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check
  check (bio is null or (length(bio) between 1 and 300 and bio !~ '[\x00-\x09\x0b-\x1f\x7f]'));

alter table public.profiles drop constraint if exists profiles_website_check;
alter table public.profiles add constraint profiles_website_check
  check (website is null or (length(website) <= 200 and website ~* '^https?://[^\s]+$'));
