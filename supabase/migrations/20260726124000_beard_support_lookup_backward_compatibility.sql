-- Keep the owner-safe support lookup compatible with the already deployed web client.
-- The recommendation index remains durably stored and is also present in jsonPath;
-- it must not make the entire terminal record unreadable to strict older clients.

alter function public.lookup_beard_analysis_support_diagnostic(uuid, text)
  rename to lookup_beard_analysis_support_diagnostic_v24;

revoke all on function public.lookup_beard_analysis_support_diagnostic_v24(uuid, text)
  from public, anon, authenticated, service_role;

create function public.lookup_beard_analysis_support_diagnostic(
  candidate_workspace_id uuid,
  candidate_support_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.lookup_beard_analysis_support_diagnostic_v24(
    candidate_workspace_id,
    candidate_support_id
  ) - 'recommendationIndex'
$$;

revoke all on function public.lookup_beard_analysis_support_diagnostic(uuid, text)
  from public, anon, service_role;
grant execute on function public.lookup_beard_analysis_support_diagnostic(uuid, text)
  to authenticated;
