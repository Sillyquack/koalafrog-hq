-- Additive unit-model extension. Existing stored units and ledger history are unchanged.
create or replace function public.kf_convert_quantity(q numeric, from_unit text, to_unit text)
returns numeric language sql immutable set search_path=public,pg_temp as $$
  select case
    when from_unit=to_unit then q
    when from_unit in ('mg','g','kg') and to_unit in ('mg','g','kg') then
      q * case from_unit when 'mg' then 0.001 when 'g' then 1 else 1000 end
        / case to_unit when 'mg' then 0.001 when 'g' then 1 else 1000 end
    when from_unit='L' and to_unit='ml' then q*1000
    when from_unit='ml' and to_unit='L' then q/1000
    else null end
$$;

alter table public.development_experiment_changes
  drop constraint development_experiment_changes_check;
alter table public.development_experiment_changes
  add constraint development_experiment_changes_check
  check((proposed_value is null and unit is null) or
        (proposed_value is not null and unit in ('%','mg','g','kg','ml','L','pcs')));

create or replace function public.create_lab_batch_from_experiment(target_experiment uuid,target_variant uuid,formula_version text,batch_size numeric,batch_unit text,idempotency uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); e development_experiments; v development_experiment_variants; fv formula_versions; f formulas; new_id text; existing text; batch_no text;
begin select lab_batch_id into existing from development_experiment_handoffs where idempotency_key=idempotency and owner_user_id=uid; if existing is not null then return existing; end if; select * into e from development_experiments where id=target_experiment and owner_user_id=uid for update; select * into v from development_experiment_variants where id=target_variant and experiment_id=e.id and owner_user_id=uid for update; select * into fv from formula_versions where workspace_id=e.workspace_id and id=formula_version; select * into f from formulas where workspace_id=e.workspace_id and id=fv.formula_id; if e.id is null or v.id is null or e.status not in ('approved','handed_off') or fv.status not in ('Draft','Candidate','Approved') or batch_size<=0 or batch_unit not in ('mg','g','kg','ml','L','pcs') then raise exception 'Experiment is not eligible for Lab handoff'; end if;
 perform set_config('koalafrog.experiment_handoff','true',true);
 new_id:='lb-exp-'||substr(gen_random_uuid()::text,1,12); batch_no:='KF-LAB-EXP-'||upper(substr(new_id,8,8)); insert into lab_batches(workspace_id,owner_id,id,batch_number,product_id,formula_id,formula_version_id,status,planned_batch_size,planned_batch_unit,created_at,updated_at,purpose,notes,summary,target_characteristics,development_experiment_id,development_experiment_variant_id) values(e.workspace_id,uid,new_id,batch_no,f.product_id,f.id,fv.id,'Planned',batch_size,batch_unit,now()::text,now()::text,e.title,'Created by explicit Development Experiment handoff','','',e.id,v.id);
 insert into lab_batch_lines(workspace_id,owner_id,id,lab_batch_id,formula_line_id,ingredient_id,ingredient_name_snapshot,phase,planned_percentage,planned_quantity,unit,notes,status) select l.workspace_id,l.owner_id,'lbl-exp-'||substr(gen_random_uuid()::text,1,12),new_id,l.id,l.ingredient_id,i.common_name,l.phase,l.percentage,(l.percentage/100)*batch_size,batch_unit,l.notes,'Pending' from formula_lines l join ingredients i on i.workspace_id=l.workspace_id and i.id=l.ingredient_id where l.workspace_id=e.workspace_id and l.formula_version_id=fv.id;
 insert into development_experiment_handoffs(workspace_id,owner_user_id,experiment_id,variant_id,handoff_type,idempotency_key,lab_batch_id,formula_version_id) values(e.workspace_id,uid,e.id,v.id,'lab_batch',idempotency,new_id,fv.id); update development_experiment_variants set linked_lab_batch_id=new_id,status='handed_off',updated_at=now() where id=v.id; perform set_config('koalafrog.experiment_transition','true',true); update development_experiments set status='handed_off',revision=revision+1,updated_at=now() where id=e.id; insert into development_experiment_status_events(workspace_id,owner_user_id,experiment_id,from_status,to_status,note) values(e.workspace_id,uid,e.id,e.status,'handed_off','Lab Batch created'); return new_id; end $$;
revoke all on function public.create_lab_batch_from_experiment(uuid,uuid,text,numeric,text,uuid) from public,anon;
grant execute on function public.create_lab_batch_from_experiment(uuid,uuid,text,numeric,text,uuid) to authenticated;
