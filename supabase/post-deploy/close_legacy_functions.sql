-- Phase 2 of the launch hardening. Apply ONLY after the new app version is deployed AND
-- SKIHOST_SERVER_SECRET is set in production (check /api/health → "server_secret": "valid"):
-- the old functions below were callable by anyone with the public key.
revoke execute on function public.download_archive(text, text, text) from public, anon, authenticated;
revoke execute on function public.save_a2a_task(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.get_a2a_task(text) from public, anon, authenticated;
