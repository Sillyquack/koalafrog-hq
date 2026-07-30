create or replace function public.finish_beard_analysis_review(
  candidate_workspace_id uuid,
  candidate_analysis_id uuid,
  candidate_decisions jsonb,
  candidate_summary_snapshot jsonb,
  candidate_trim_plan_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  current_owner uuid:=auth.uid();
  decision jsonb;
  affected integer;
  finished timestamptz;
  recorded_target jsonb;
  normalized_summary_target jsonb;
  normalized_plan_target jsonb;
begin
  if current_owner is null or jsonb_typeof(candidate_decisions) is distinct from 'array' or
    jsonb_typeof(candidate_summary_snapshot) is distinct from 'object' or jsonb_typeof(candidate_trim_plan_snapshot) is distinct from 'object' then
    raise exception using errcode='22023',message='INVALID_REVIEW_SNAPSHOT';
  end if;
  if candidate_summary_snapshot->>'version'<>'2' or
     candidate_trim_plan_snapshot->>'version'<>'2' or
     candidate_trim_plan_snapshot->>'intelligenceVersion'<>'beard-intelligence-v2' or
     jsonb_typeof(candidate_summary_snapshot->'strengths') is distinct from 'array' or
     jsonb_typeof(candidate_summary_snapshot->'highestImpactImprovements') is distinct from 'array' or
     jsonb_typeof(candidate_summary_snapshot->'sequence') is distinct from 'array' or
     jsonb_typeof(candidate_trim_plan_snapshot->'steps') is distinct from 'array' or
     exists(select 1 from jsonb_array_elements(candidate_trim_plan_snapshot->'steps') step where
       not (step ?& array['id','order','title','region','tool','attachmentOrComb','guardSetting','technique','fallbackWording','caution','expectedResult','recommendationIds']) or
       jsonb_typeof(step->'recommendationIds') is distinct from 'array'
     ) then
    raise exception using errcode='22023',message='INVALID_REVIEW_SNAPSHOT_SCHEMA';
  end if;
  select target_style into recorded_target from public.intelligence_analyses
    where workspace_id=candidate_workspace_id and id=candidate_analysis_id and owner_user_id=current_owner
      and status in ('completed','completed_cleanup_required') for update;
  if not found then raise exception using errcode='P0002',message='ANALYSIS_NOT_FOUND'; end if;

  normalized_summary_target:=case
    when not (candidate_summary_snapshot ? 'targetStyle')
      or jsonb_typeof(candidate_summary_snapshot->'targetStyle')='null' then null
    else candidate_summary_snapshot->'targetStyle'
  end;
  normalized_plan_target:=case
    when not (candidate_trim_plan_snapshot ? 'targetStyle')
      or jsonb_typeof(candidate_trim_plan_snapshot->'targetStyle')='null' then null
    else candidate_trim_plan_snapshot->'targetStyle'
  end;
  if normalized_summary_target is distinct from recorded_target or
     normalized_plan_target is distinct from recorded_target then
    raise exception using errcode='22023',message='SNAPSHOT_TARGET_MISMATCH';
  end if;
  if (select count(*) from jsonb_array_elements(candidate_decisions)) <>
     (select count(*) from public.intelligence_recommendations where workspace_id=candidate_workspace_id and analysis_id=candidate_analysis_id and owner_user_id=current_owner) then
    raise exception using errcode='22023',message='INCOMPLETE_REVIEW_DECISIONS';
  end if;
  if (select count(distinct value->>'recommendationId') from jsonb_array_elements(candidate_decisions)) <>
     (select count(*) from jsonb_array_elements(candidate_decisions)) then
    raise exception using errcode='22023',message='DUPLICATE_REVIEW_DECISION';
  end if;
  for decision in select * from jsonb_array_elements(candidate_decisions) loop
    if decision->>'status' not in ('undecided','accepted_for_planning','dismissed') then
      raise exception using errcode='22023',message='INVALID_REVIEW_DECISION';
    end if;
    update public.intelligence_recommendations set review_status=decision->>'status',updated_at=now()
      where workspace_id=candidate_workspace_id and analysis_id=candidate_analysis_id and owner_user_id=current_owner
        and id=(decision->>'recommendationId')::uuid
        and review_status is distinct from decision->>'status';
    get diagnostics affected=row_count;
    if affected=0 and not exists(
      select 1 from public.intelligence_recommendations where workspace_id=candidate_workspace_id
        and analysis_id=candidate_analysis_id and owner_user_id=current_owner and id=(decision->>'recommendationId')::uuid
    ) then raise exception using errcode='22023',message='UNKNOWN_RECOMMENDATION'; end if;
  end loop;
  update public.intelligence_analyses set summary_snapshot=candidate_summary_snapshot,
    trim_plan_snapshot=candidate_trim_plan_snapshot,analysis_version='beard-intelligence-v2',
    review_finished_at=coalesce(review_finished_at,now())
    where workspace_id=candidate_workspace_id and id=candidate_analysis_id and owner_user_id=current_owner
    returning review_finished_at into finished;
  return jsonb_build_object('analysisId',candidate_analysis_id,'reviewFinishedAt',finished,'saved',true);
end $$;

revoke all on function public.finish_beard_analysis_review(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.finish_beard_analysis_review(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;
