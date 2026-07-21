-- Supabase default privileges grant table-level access to authenticated on new
-- public tables. Replace that broad grant with only the Beard analysis writes
-- required by the authenticated Edge Function and review UI.
revoke all on table public.intelligence_analyses from authenticated;
revoke all on table public.intelligence_analysis_inputs from authenticated;
revoke all on table public.intelligence_observations from authenticated;
revoke all on table public.intelligence_recommendations from authenticated;

grant select,insert on table public.intelligence_analyses to authenticated;
grant select,insert on table public.intelligence_analysis_inputs to authenticated;
grant select,insert on table public.intelligence_observations to authenticated;
grant select,insert on table public.intelligence_recommendations to authenticated;

grant update(status,result_payload,error_code,provider_name,model_name,provider_usage,completed_at)
  on table public.intelligence_analyses to authenticated;
grant update(cleanup_state,cleaned_at)
  on table public.intelligence_analysis_inputs to authenticated;
grant update(review_status,updated_at)
  on table public.intelligence_recommendations to authenticated;
