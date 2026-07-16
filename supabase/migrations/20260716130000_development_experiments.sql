alter table public.intelligence_runs add constraint intelligence_runs_workspace_id_id_unique unique(workspace_id,id);

create table public.development_experiments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_user_id uuid not null,
  title text not null check(length(trim(title))>0),
  experiment_type text not null check(experiment_type in ('scent_direction','formula_adjustment','ingredient_comparison','formula_comparison','process_adjustment','stability_observation','general_development')),
  status text not null default 'draft' check(status in ('draft','ready_for_review','approved','handed_off','in_progress','completed','cancelled','archived')),
  objective text not null, hypothesis text not null, product_id text, base_formula_version_id text,
  source_intelligence_thread_id uuid, source_intelligence_run_id uuid,
  source_response_item_type text check(source_response_item_type in ('direction','experiment')),
  source_response_item_id text, user_rationale text, acceptance_criteria text, notes text,
  conclusion text, outcome_summary text, hypothesis_outcome text check(hypothesis_outcome in ('held','partially_held','did_not_hold','inconclusive')),
  preferred_variant_id uuid, next_step text, creation_idempotency_key uuid not null unique,
  revision bigint not null default 1, approved_at timestamptz, completed_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,product_id) references public.products(workspace_id,id),
  foreign key(workspace_id,base_formula_version_id) references public.formula_versions(workspace_id,id),
  foreign key(workspace_id,source_intelligence_thread_id) references public.intelligence_threads(workspace_id,id),
  foreign key(workspace_id,source_intelligence_run_id) references public.intelligence_runs(workspace_id,id),
  check((source_intelligence_run_id is null)=(source_response_item_id is null))
);
create table public.development_experiment_variants (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_user_id uuid not null,
  experiment_id uuid not null, name text not null check(length(trim(name))>0), purpose text not null default '',
  is_control boolean not null default false, display_order integer not null check(display_order>=0),
  linked_formula_version_id text, linked_lab_batch_id text,
  status text not null default 'planned' check(status in ('planned','handed_off','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,id), unique(workspace_id,experiment_id,name), unique(workspace_id,experiment_id,display_order),
  foreign key(workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,experiment_id) references public.development_experiments(workspace_id,id) on delete cascade,
  foreign key(workspace_id,linked_formula_version_id) references public.formula_versions(workspace_id,id),
  foreign key(workspace_id,linked_lab_batch_id) references public.lab_batches(workspace_id,id)
);
alter table public.development_experiments add constraint development_experiments_preferred_variant_fk
  foreign key(workspace_id,preferred_variant_id) references public.development_experiment_variants(workspace_id,id);
create unique index development_experiment_one_control on public.development_experiment_variants(workspace_id,experiment_id) where is_control;
create table public.development_experiment_changes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_user_id uuid not null,
  experiment_id uuid not null, variant_id uuid not null, ingredient_id text, concept_material_name text,
  change_type text not null check(change_type in ('add','increase','decrease','remove','hold_constant','substitute','process_change','observation_only')),
  qualitative_guidance text check(qualitative_guidance in ('trace','low','moderate','structural')),
  current_value numeric, proposed_value numeric, unit text, rationale text not null default '', display_order integer not null check(display_order>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,id), unique(workspace_id,variant_id,display_order),
  foreign key(workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,experiment_id) references public.development_experiments(workspace_id,id) on delete cascade,
  foreign key(workspace_id,variant_id) references public.development_experiment_variants(workspace_id,id) on delete cascade,
  foreign key(workspace_id,ingredient_id) references public.ingredients(workspace_id,id),
  check(num_nonnulls(ingredient_id,concept_material_name)>0),
  check(proposed_value is null or proposed_value>=0),
  check((proposed_value is null and unit is null) or (proposed_value is not null and unit in ('%','g','kg','ml','L','pcs')))
);
create table public.development_experiment_observation_prompts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_user_id uuid not null,
  experiment_id uuid not null, variant_id uuid, checkpoint_type text,
  prompt text not null check(length(trim(prompt))>0),
  category text not null check(category in ('scent','texture','absorption','appearance','stability','process','yield','comparison','other')),
  display_order integer not null check(display_order>=0), is_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique(workspace_id,id), unique(workspace_id,experiment_id,display_order),
  foreign key(workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,experiment_id) references public.development_experiments(workspace_id,id) on delete cascade,
  foreign key(workspace_id,variant_id) references public.development_experiment_variants(workspace_id,id) on delete cascade
);
create table public.development_experiment_status_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_user_id uuid not null,
  experiment_id uuid not null, from_status text, to_status text not null, note text,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,experiment_id) references public.development_experiments(workspace_id,id) on delete cascade
);
create table public.development_experiment_handoffs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_user_id uuid not null,
  experiment_id uuid not null, variant_id uuid not null,
  handoff_type text not null check(handoff_type in ('standalone','formula_branch','lab_batch')),
  idempotency_key uuid not null unique, formula_version_id text, lab_batch_id text,
  created_at timestamptz not null default now(),
  unique(workspace_id,experiment_id,variant_id,handoff_type),
  foreign key(workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,experiment_id) references public.development_experiments(workspace_id,id) on delete cascade,
  foreign key(workspace_id,variant_id) references public.development_experiment_variants(workspace_id,id) on delete cascade,
  foreign key(workspace_id,formula_version_id) references public.formula_versions(workspace_id,id),
  foreign key(workspace_id,lab_batch_id) references public.lab_batches(workspace_id,id)
);
alter table public.formula_versions add column development_experiment_id uuid, add column development_experiment_variant_id uuid;
alter table public.formula_versions add constraint formula_versions_experiment_fk foreign key(workspace_id,development_experiment_id) references public.development_experiments(workspace_id,id), add constraint formula_versions_experiment_variant_fk foreign key(workspace_id,development_experiment_variant_id) references public.development_experiment_variants(workspace_id,id);
alter table public.lab_batches add column development_experiment_id uuid, add column development_experiment_variant_id uuid;
alter table public.lab_batches add constraint lab_batches_experiment_fk foreign key(workspace_id,development_experiment_id) references public.development_experiments(workspace_id,id), add constraint lab_batches_experiment_variant_fk foreign key(workspace_id,development_experiment_variant_id) references public.development_experiment_variants(workspace_id,id);
alter table public.scent_memory_sessions add column development_experiment_id uuid, add column development_experiment_variant_id uuid;
alter table public.scent_memory_sessions add constraint scent_memory_experiment_fk foreign key(workspace_id,development_experiment_id) references public.development_experiments(workspace_id,id), add constraint scent_memory_experiment_variant_fk foreign key(workspace_id,development_experiment_variant_id) references public.development_experiment_variants(workspace_id,id);

create index development_experiments_library on public.development_experiments(workspace_id,archived_at,status,updated_at desc);
create index development_variants_experiment on public.development_experiment_variants(workspace_id,experiment_id,display_order);
create index development_changes_variant on public.development_experiment_changes(workspace_id,variant_id,display_order);
create index development_prompts_experiment on public.development_experiment_observation_prompts(workspace_id,experiment_id,display_order);
create index development_events_experiment on public.development_experiment_status_events(workspace_id,experiment_id,created_at);

do $$ declare t text; begin foreach t in array array['development_experiments','development_experiment_variants','development_experiment_changes','development_experiment_observation_prompts','development_experiment_status_events','development_experiment_handoffs'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy %I_owner_all on public.%I for all to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state=''active''))',t,t); execute format('revoke all on public.%I from anon',t); execute format('grant select,insert,update on public.%I to authenticated',t); end loop; end $$;
revoke delete on public.development_experiments,public.development_experiment_variants,public.development_experiment_changes,public.development_experiment_observation_prompts,public.development_experiment_status_events,public.development_experiment_handoffs from authenticated;
revoke insert on public.development_experiments from authenticated;
revoke insert,update on public.development_experiment_status_events,public.development_experiment_handoffs from authenticated;

create or replace function public.create_development_experiment(plan jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; eid uuid; source jsonb; source_item jsonb; v jsonb; c jsonb; p jsonb; vid uuid; key uuid:=(plan->>'idempotencyKey')::uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select id into wid from workspaces where owner_id=uid and lifecycle_state='active'; if wid is null then raise exception 'Active workspace required'; end if;
 select id into eid from development_experiments where workspace_id=wid and creation_idempotency_key=key; if eid is not null then return eid; end if;
 if plan->>'sourceRunId' is not null then
  select response_payload into source from intelligence_runs where workspace_id=wid and owner_user_id=uid and id=(plan->>'sourceRunId')::uuid and status='completed';
  if source is null then raise exception 'Source Intelligence run unavailable'; end if;
  select x into source_item from jsonb_array_elements(source -> (case when plan->>'sourceItemType'='direction' then 'directions' else 'experiments' end)) x where x->>'id'=plan->>'sourceItemId';
  if source_item is null then raise exception 'Source Intelligence item unavailable'; end if;
 end if;
 insert into development_experiments(workspace_id,owner_user_id,title,experiment_type,objective,hypothesis,product_id,base_formula_version_id,source_intelligence_thread_id,source_intelligence_run_id,source_response_item_type,source_response_item_id,user_rationale,acceptance_criteria,notes,creation_idempotency_key)
 values(wid,uid,plan->>'title',plan->>'experimentType',plan->>'objective',plan->>'hypothesis',nullif(plan->>'productId',''),nullif(plan->>'baseFormulaVersionId',''),nullif(plan->>'sourceThreadId','')::uuid,nullif(plan->>'sourceRunId','')::uuid,nullif(plan->>'sourceItemType',''),nullif(plan->>'sourceItemId',''),nullif(plan->>'userRationale',''),nullif(plan->>'acceptanceCriteria',''),nullif(plan->>'notes',''),key) returning id into eid;
 for v in select * from jsonb_array_elements(coalesce(plan->'variants','[]')) loop
  vid:=coalesce(nullif(v->>'id','')::uuid,gen_random_uuid()); insert into development_experiment_variants(id,workspace_id,owner_user_id,experiment_id,name,purpose,is_control,display_order) values(vid,wid,uid,eid,v->>'name',coalesce(v->>'purpose',''),coalesce((v->>'isControl')::boolean,false),(v->>'displayOrder')::integer);
  for c in select * from jsonb_array_elements(coalesce(v->'changes','[]')) loop insert into development_experiment_changes(workspace_id,owner_user_id,experiment_id,variant_id,ingredient_id,concept_material_name,change_type,qualitative_guidance,current_value,proposed_value,unit,rationale,display_order) values(wid,uid,eid,vid,nullif(c->>'ingredientId',''),nullif(c->>'conceptMaterialName',''),c->>'changeType',nullif(c->>'qualitativeGuidance',''),nullif(c->>'currentValue','')::numeric,nullif(c->>'proposedValue','')::numeric,nullif(c->>'unit',''),coalesce(c->>'rationale',''),(c->>'displayOrder')::integer); end loop;
 end loop;
 for p in select * from jsonb_array_elements(coalesce(plan->'observationPrompts','[]')) loop insert into development_experiment_observation_prompts(workspace_id,owner_user_id,experiment_id,checkpoint_type,prompt,category,display_order,is_required) values(wid,uid,eid,nullif(p->>'checkpointType',''),p->>'prompt',p->>'category',(p->>'displayOrder')::integer,coalesce((p->>'isRequired')::boolean,false)); end loop;
 insert into development_experiment_status_events(workspace_id,owner_user_id,experiment_id,to_status,note) values(wid,uid,eid,'draft',case when source_item is null then 'Plan created' else 'Created from verified Intelligence suggestion' end); return eid;
end $$;
revoke all on function public.create_development_experiment(jsonb) from public,anon; grant execute on function public.create_development_experiment(jsonb) to authenticated;

create or replace function public.transition_development_experiment(target_id uuid,target_status text,expected_revision bigint,note text default null) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); e development_experiments; allowed boolean:=false; issues integer;
begin select * into e from development_experiments where id=target_id and owner_user_id=uid for update; if e.id is null then raise exception 'Experiment unavailable'; end if; if e.revision<>expected_revision then raise exception 'Stale Experiment write'; end if;
 allowed:=case e.status when 'draft' then target_status in ('ready_for_review','cancelled','archived') when 'ready_for_review' then target_status in ('draft','approved','cancelled') when 'approved' then target_status in ('handed_off','in_progress','cancelled') when 'handed_off' then target_status in ('in_progress','completed','cancelled') when 'in_progress' then target_status in ('completed','cancelled') when 'completed' then target_status='archived' when 'cancelled' then target_status='archived' else false end; if not allowed then raise exception 'Invalid Experiment lifecycle transition'; end if;
 if target_status='approved' then select count(*) into issues from development_experiment_variants v where v.experiment_id=e.id; if trim(e.title)='' or (trim(e.objective)='' and trim(e.hypothesis)='') or issues=0 then raise exception 'Experiment has blocking review issues'; end if; if exists(select 1 from development_experiment_changes c where c.experiment_id=e.id and c.concept_material_name is not null and c.ingredient_id is null and c.proposed_value is not null) then raise exception 'Quantitative Concept Materials must be mapped'; end if; end if;
 perform set_config('koalafrog.experiment_transition','true',true);
 update development_experiments set status=target_status,revision=revision+1,updated_at=now(),approved_at=case when target_status='approved' then now() else approved_at end,completed_at=case when target_status='completed' then now() else completed_at end,archived_at=case when target_status='archived' then now() else archived_at end where id=e.id;
 insert into development_experiment_status_events(workspace_id,owner_user_id,experiment_id,from_status,to_status,note) values(e.workspace_id,uid,e.id,e.status,target_status,note); return e.revision+1; end $$;
revoke all on function public.transition_development_experiment(uuid,text,bigint,text) from public,anon; grant execute on function public.transition_development_experiment(uuid,text,bigint,text) to authenticated;

create or replace function public.create_formula_branch_from_experiment(target_experiment uuid,target_variant uuid,idempotency uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); e development_experiments; v development_experiment_variants; new_id text; existing text; total numeric; ch development_experiment_changes; line_id text;
begin select formula_version_id into existing from development_experiment_handoffs where idempotency_key=idempotency and owner_user_id=uid; if existing is not null then return existing; end if; select * into e from development_experiments where id=target_experiment and owner_user_id=uid for update; select * into v from development_experiment_variants where id=target_variant and experiment_id=e.id and owner_user_id=uid for update; if e.id is null or v.id is null or e.status not in ('approved','handed_off') or e.base_formula_version_id is null then raise exception 'Experiment is not eligible for Formula handoff'; end if; if exists(select 1 from development_experiment_changes where variant_id=v.id and concept_material_name is not null and ingredient_id is null) then raise exception 'Unmapped Concept Material blocks Formula handoff'; end if;
 perform set_config('koalafrog.experiment_handoff','true',true);
 new_id:='fv-exp-'||substr(gen_random_uuid()::text,1,12); insert into formula_versions(workspace_id,owner_id,id,formula_id,version,status,description,target_characteristics,process_instructions,development_notes,created_at,updated_at,derived_from_version_id,development_experiment_id,development_experiment_variant_id) select workspace_id,owner_id,new_id,formula_id,'Experiment '||substr(new_id,8),'Draft',description,target_characteristics,process_instructions,'Created by explicit Development Experiment handoff',now()::text,now()::text,id,e.id,v.id from formula_versions where workspace_id=e.workspace_id and id=e.base_formula_version_id;
 insert into formula_lines(workspace_id,owner_id,id,formula_version_id,ingredient_id,percentage,phase,sort_order,notes) select workspace_id,owner_id,'fl-exp-'||substr(gen_random_uuid()::text,1,12),new_id,ingredient_id,percentage,phase,sort_order,notes from formula_lines where workspace_id=e.workspace_id and formula_version_id=e.base_formula_version_id;
 for ch in select * from development_experiment_changes where variant_id=v.id order by display_order loop select id into line_id from formula_lines where workspace_id=e.workspace_id and formula_version_id=new_id and ingredient_id=ch.ingredient_id limit 1; if ch.change_type='remove' then delete from formula_lines where workspace_id=e.workspace_id and id=line_id; elsif line_id is not null and ch.proposed_value is not null and ch.unit='%' then update formula_lines set percentage=ch.proposed_value where workspace_id=e.workspace_id and id=line_id; elsif ch.change_type='add' and ch.ingredient_id is not null and ch.proposed_value is not null and ch.unit='%' then insert into formula_lines(workspace_id,owner_id,id,formula_version_id,ingredient_id,percentage,phase,sort_order,notes) values(e.workspace_id,uid,'fl-exp-'||substr(gen_random_uuid()::text,1,12),new_id,ch.ingredient_id,ch.proposed_value,'Experiment',(select coalesce(max(sort_order),0)+1 from formula_lines where workspace_id=e.workspace_id and formula_version_id=new_id),ch.rationale); end if; end loop;
 select sum(percentage) into total from formula_lines where workspace_id=e.workspace_id and formula_version_id=new_id; if total<>100 then raise exception 'Resulting Formula must total exactly 100%%'; end if;
 insert into development_experiment_handoffs(workspace_id,owner_user_id,experiment_id,variant_id,handoff_type,idempotency_key,formula_version_id) values(e.workspace_id,uid,e.id,v.id,'formula_branch',idempotency,new_id); update development_experiment_variants set linked_formula_version_id=new_id,status='handed_off',updated_at=now() where id=v.id; perform set_config('koalafrog.experiment_transition','true',true); update development_experiments set status='handed_off',revision=revision+1,updated_at=now() where id=e.id; insert into development_experiment_status_events(workspace_id,owner_user_id,experiment_id,from_status,to_status,note) values(e.workspace_id,uid,e.id,e.status,'handed_off','Formula branch created'); return new_id; end $$;
revoke all on function public.create_formula_branch_from_experiment(uuid,uuid,uuid) from public,anon; grant execute on function public.create_formula_branch_from_experiment(uuid,uuid,uuid) to authenticated;

create or replace function public.create_lab_batch_from_experiment(target_experiment uuid,target_variant uuid,formula_version text,batch_size numeric,batch_unit text,idempotency uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); e development_experiments; v development_experiment_variants; fv formula_versions; f formulas; new_id text; existing text; batch_no text;
begin select lab_batch_id into existing from development_experiment_handoffs where idempotency_key=idempotency and owner_user_id=uid; if existing is not null then return existing; end if; select * into e from development_experiments where id=target_experiment and owner_user_id=uid for update; select * into v from development_experiment_variants where id=target_variant and experiment_id=e.id and owner_user_id=uid for update; select * into fv from formula_versions where workspace_id=e.workspace_id and id=formula_version; select * into f from formulas where workspace_id=e.workspace_id and id=fv.formula_id; if e.id is null or v.id is null or e.status not in ('approved','handed_off') or fv.status not in ('Draft','Candidate','Approved') or batch_size<=0 or batch_unit not in ('g','kg','ml','L','pcs') then raise exception 'Experiment is not eligible for Lab handoff'; end if;
 perform set_config('koalafrog.experiment_handoff','true',true);
 new_id:='lb-exp-'||substr(gen_random_uuid()::text,1,12); batch_no:='KF-LAB-EXP-'||upper(substr(new_id,8,8)); insert into lab_batches(workspace_id,owner_id,id,batch_number,product_id,formula_id,formula_version_id,status,planned_batch_size,planned_batch_unit,created_at,updated_at,purpose,notes,summary,target_characteristics,development_experiment_id,development_experiment_variant_id) values(e.workspace_id,uid,new_id,batch_no,f.product_id,f.id,fv.id,'Planned',batch_size,batch_unit,now()::text,now()::text,e.title,'Created by explicit Development Experiment handoff','','',e.id,v.id);
 insert into lab_batch_lines(workspace_id,owner_id,id,lab_batch_id,formula_line_id,ingredient_id,ingredient_name_snapshot,phase,planned_percentage,planned_quantity,unit,notes,status) select l.workspace_id,l.owner_id,'lbl-exp-'||substr(gen_random_uuid()::text,1,12),new_id,l.id,l.ingredient_id,i.common_name,l.phase,l.percentage,(l.percentage/100)*batch_size,batch_unit,l.notes,'Pending' from formula_lines l join ingredients i on i.workspace_id=l.workspace_id and i.id=l.ingredient_id where l.workspace_id=e.workspace_id and l.formula_version_id=fv.id;
 insert into development_experiment_handoffs(workspace_id,owner_user_id,experiment_id,variant_id,handoff_type,idempotency_key,lab_batch_id,formula_version_id) values(e.workspace_id,uid,e.id,v.id,'lab_batch',idempotency,new_id,fv.id); update development_experiment_variants set linked_lab_batch_id=new_id,status='handed_off',updated_at=now() where id=v.id; perform set_config('koalafrog.experiment_transition','true',true); update development_experiments set status='handed_off',revision=revision+1,updated_at=now() where id=e.id; insert into development_experiment_status_events(workspace_id,owner_user_id,experiment_id,from_status,to_status,note) values(e.workspace_id,uid,e.id,e.status,'handed_off','Lab Batch created'); return new_id; end $$;
revoke all on function public.create_lab_batch_from_experiment(uuid,uuid,text,numeric,text,uuid) from public,anon; grant execute on function public.create_lab_batch_from_experiment(uuid,uuid,text,numeric,text,uuid) to authenticated;

create or replace function public.guard_development_experiment_status() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if new.status is distinct from old.status and coalesce(current_setting('koalafrog.experiment_transition',true),'')<>'true' then raise exception 'Experiment status must use the lifecycle transition function'; end if; return new; end $$;
create trigger guard_development_experiment_status before update on public.development_experiments for each row execute function public.guard_development_experiment_status();

create or replace function public.guard_experiment_provenance() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if (new.development_experiment_id is not null or new.development_experiment_variant_id is not null) and coalesce(current_setting('koalafrog.experiment_handoff',true),'')<>'true' then raise exception 'Experiment provenance can only be created by a handoff function'; end if; return new; end $$;
create trigger guard_formula_experiment_provenance before insert or update of development_experiment_id,development_experiment_variant_id on public.formula_versions for each row execute function public.guard_experiment_provenance();
create trigger guard_lab_experiment_provenance before insert or update of development_experiment_id,development_experiment_variant_id on public.lab_batches for each row execute function public.guard_experiment_provenance();
