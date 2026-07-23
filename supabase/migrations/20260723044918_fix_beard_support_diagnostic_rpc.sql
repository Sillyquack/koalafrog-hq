-- The function and its privileges are already correct. Reassert the exact
-- browser-facing grant and force PostgREST to discard the stale schema cache
-- that produced the production RPC availability failure.

revoke all on function public.lookup_beard_analysis_support_diagnostic(uuid,text)
  from public,anon,service_role;
grant execute on function public.lookup_beard_analysis_support_diagnostic(uuid,text)
  to authenticated;

notify pgrst, 'reload schema';
