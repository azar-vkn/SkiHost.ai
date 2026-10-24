-- Moderator powers (disable racks, suspend accounts, delete) need the strongest sign-in: a browser
-- session of an admin account that has two-factor authentication enabled. API tokens can't
-- moderate, and skihost_actor() already demands the 2FA code (aal2) for sessions of such accounts.
create or replace function public._is_admin(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.profiles p
        where p.id = p_actor and p.user_id = auth.uid() and p.role = 'admin' and p.suspended_at is null
          and exists (select 1 from auth.mfa_factors f where f.user_id = p.user_id and f.status = 'verified')
     )
$$;
revoke execute on function public._is_admin(uuid) from public, anon, authenticated;
