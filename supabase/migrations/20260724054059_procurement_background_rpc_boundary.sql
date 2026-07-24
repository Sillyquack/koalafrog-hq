-- Supabase public-schema default privileges grant broad table access to
-- service_role when a table is created. These lifecycle tables are deliberately
-- RPC-mutated: Edge Functions may inspect them directly, but every state change
-- must pass through the fixed-search-path SECURITY DEFINER lifecycle functions.
revoke all privileges
  on table public.procurement_background_operations
  from public, anon, authenticated, service_role;

revoke all privileges
  on table public.procurement_background_webhook_inbox
  from public, anon, authenticated, service_role;

grant select
  on table public.procurement_background_operations
  to service_role;

grant select
  on table public.procurement_background_webhook_inbox
  to service_role;
