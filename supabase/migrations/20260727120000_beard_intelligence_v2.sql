-- Beard Intelligence v2: deterministic review snapshots and owner-safe history.
-- Provider payloads and private image paths remain behind their existing boundaries.
alter table public.intelligence_analyses
  add column target_style jsonb,
  add column summary_snapshot jsonb,
  add column trim_plan_snapshot jsonb,
  -- Null means the analysis predates deterministic planning metadata.
  add column analysis_version text,
  add column review_finished_at timestamptz;

alter table public.intelligence_analyses add constraint intelligence_analyses_target_style_shape check (
  target_style is null or (
    jsonb_typeof(target_style)='object' and
    target_style->>'value' in ('structured_full_beard','short_boxed_beard','natural_defined_beard','fuller_chin_soft_side_fade','rugged_full_beard','custom')
  )
);

create function public.finish_beard_analysis_review(
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
declare current_owner uuid:=auth.uid(); decision jsonb; affected integer; finished timestamptz; recorded_target jsonb;
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
  if candidate_summary_snapshot->'targetStyle' is distinct from recorded_target or
     candidate_trim_plan_snapshot->'targetStyle' is distinct from recorded_target then
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
-- These are owner-facing RPCs. The edge function does not call them, so service_role
-- execution is deliberately withheld to keep the public review surface minimal.

create function public.list_beard_analysis_history(candidate_workspace_id uuid,candidate_limit integer default 20,candidate_before timestamptz default null,candidate_before_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select coalesce(jsonb_agg(row_data order by occurred_at desc,id desc),'[]'::jsonb) from (
    select a.created_at occurred_at,a.id,jsonb_build_object(
      'analysisId',a.id,'supportId',a.correlation_id,'createdAt',a.created_at,'completedAt',a.completed_at,'status',a.status,
      'targetStyle',a.target_style,'provider',case when a.provider_name='openai' then a.provider_name else null end,
      'model',case when a.model_name in ('gpt-5','gpt-5-2025-08-07') then a.model_name else null end,
      'overallSummary',a.summary_snapshot->>'overallAssessment','photoQuality',a.result_payload->'photoQuality'->>'overall',
      'acceptedCount',count(distinct r.id) filter(where r.review_status='accepted_for_planning'),
      'undecidedCount',count(distinct r.id) filter(where r.review_status='undecided'),
      'dismissedCount',count(distinct r.id) filter(where r.review_status='dismissed'),
      'cleanupState',case when bool_or(i.cleanup_state='cleanup_required') then 'cleanup_required' when count(i.id)>0 and bool_and(i.cleanup_state='deleted') then 'deleted' else 'pending' end,
      'failureCategory',case when a.status='failed' then a.error_code else null end,'analysisVersion',a.analysis_version
    ) row_data
    from public.intelligence_analyses a
    left join public.intelligence_recommendations r on r.workspace_id=a.workspace_id and r.analysis_id=a.id and r.owner_user_id=a.owner_user_id
    left join public.intelligence_analysis_inputs i on i.workspace_id=a.workspace_id and i.analysis_id=a.id and i.owner_user_id=a.owner_user_id
    where a.workspace_id=candidate_workspace_id and a.owner_user_id=auth.uid() and a.analysis_type='beard_photo_analysis'
      and a.status in ('completed','completed_cleanup_required','failed') and (
        candidate_before is null or a.created_at<candidate_before or
        (a.created_at=candidate_before and candidate_before_id is not null and a.id<candidate_before_id)
      )
    group by a.id order by a.created_at desc,a.id desc limit greatest(1,least(coalesce(candidate_limit,20),50))
  ) history
$$;
revoke all on function public.list_beard_analysis_history(uuid,integer,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.list_beard_analysis_history(uuid,integer,timestamptz,uuid) to authenticated;

create function public.reopen_beard_analysis(candidate_workspace_id uuid,candidate_analysis_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select case when a.status='failed' then jsonb_build_object(
   'analysisId',a.id,'supportId',a.correlation_id,'status',a.status,'errorCode',a.error_code,'createdAt',a.created_at
 ) else jsonb_build_object(
   'analysisId',a.id,'supportId',a.correlation_id,'status',a.status,'createdAt',a.created_at,'completedAt',a.completed_at,
   'targetStyle',a.target_style,'result',a.result_payload,'summarySnapshot',a.summary_snapshot,'trimPlanSnapshot',a.trim_plan_snapshot,
   'analysisVersion',a.analysis_version,'reviewFinishedAt',a.review_finished_at,
   'decisions',coalesce((select jsonb_agg(jsonb_build_object('recommendationId',r.id,'status',r.review_status) order by r.id)
     from public.intelligence_recommendations r where r.workspace_id=a.workspace_id and r.analysis_id=a.id and r.owner_user_id=a.owner_user_id),'[]'::jsonb),
   'provenance',jsonb_build_object('provider',case when a.provider_name='openai' then a.provider_name else null end,'model',case when a.model_name in ('gpt-5','gpt-5-2025-08-07') then a.model_name else null end,'promptVersion',a.prompt_version,'contractVersion',a.contract_version,'schemaVersion',a.schema_version,'semanticVersion',a.semantic_rule_version)
 ) end
 from public.intelligence_analyses a where a.workspace_id=candidate_workspace_id and a.id=candidate_analysis_id
   and a.owner_user_id=auth.uid() and a.analysis_type='beard_photo_analysis' and a.status in ('completed','completed_cleanup_required','failed')
$$;
revoke all on function public.reopen_beard_analysis(uuid,uuid) from public,anon,service_role;
grant execute on function public.reopen_beard_analysis(uuid,uuid) to authenticated;
