-- v0.11 Product Studio: optional multi-phase formula/process metadata and Beard Butter execution fields.
alter table public.product_studio_concepts
  drop constraint product_studio_concepts_product_type_check,
  add constraint product_studio_concepts_product_type_check check(product_type in('beard_oil','beard_butter'));

alter table public.formula_versions
  add column phase_definitions jsonb default '[]'::jsonb check(phase_definitions is null or jsonb_typeof(phase_definitions)='array'),
  add column manufacturing_process jsonb default '[]'::jsonb check(manufacturing_process is null or jsonb_typeof(manufacturing_process)='array');

alter table public.lab_process_steps
  add column title text,
  add column phase_code text,
  add column target_temperature numeric,
  add column minimum_temperature numeric,
  add column maximum_temperature numeric,
  add column actual_temperature numeric,
  add column duration_minutes numeric check(duration_minutes is null or duration_minutes>=0),
  add column mixing_method text,
  add column mixing_intensity text,
  add column completion_criteria text,
  add column critical boolean default false,
  add column operator_note text;
alter table public.lab_process_steps
  add constraint lab_process_temperature_range check(minimum_temperature is null or maximum_temperature is null or minimum_temperature<=maximum_temperature),
  add constraint lab_process_finite_values check(
    (target_temperature is null or target_temperature<>'NaN'::numeric) and
    (minimum_temperature is null or minimum_temperature<>'NaN'::numeric) and
    (maximum_temperature is null or maximum_temperature<>'NaN'::numeric) and
    (actual_temperature is null or actual_temperature<>'NaN'::numeric) and
    (duration_minutes is null or duration_minutes<>'NaN'::numeric)
  );

alter table public.lab_batches
  add column fill_count numeric check(fill_count is null or fill_count>=0),
  add column packaging_used text,
  add column deviations text,
  add column final_texture_observations text;
alter table public.lab_batches
  add constraint lab_batch_fill_count_finite check(fill_count is null or fill_count<>'NaN'::numeric);

-- Existing Development handoff RPCs create derived Formula Versions and Lab Batches.
-- Preserve the new optional metadata without changing their established signatures.
create or replace function public.inherit_formula_process_metadata()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.derived_from_version_id is not null
    and (coalesce(jsonb_array_length(new.phase_definitions),0)=0
      or coalesce(jsonb_array_length(new.manufacturing_process),0)=0) then
    select
      case when coalesce(jsonb_array_length(new.phase_definitions),0)=0 then phase_definitions else new.phase_definitions end,
      case when coalesce(jsonb_array_length(new.manufacturing_process),0)=0 then manufacturing_process else new.manufacturing_process end
      into new.phase_definitions,new.manufacturing_process
    from public.formula_versions
    where workspace_id=new.workspace_id and id=new.derived_from_version_id;
  end if;
  return new;
end $$;
create trigger inherit_formula_process_metadata
before insert on public.formula_versions
for each row execute function public.inherit_formula_process_metadata();

create or replace function public.snapshot_experiment_lab_process()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare step jsonb;
begin
  if new.development_experiment_id is null then return new; end if;
  for step in
    select value from jsonb_array_elements(coalesce(
      (select manufacturing_process from public.formula_versions where workspace_id=new.workspace_id and id=new.formula_version_id),
      '[]'::jsonb
    ))
  loop
    insert into public.lab_process_steps(
      workspace_id,owner_id,id,lab_batch_id,step_number,title,instruction,phase_code,
      target_temperature,minimum_temperature,maximum_temperature,duration_minutes,
      mixing_method,mixing_intensity,completion_criteria,critical,operator_note,status,notes
    ) values(
      new.workspace_id,new.owner_id,'lps-exp-'||substr(gen_random_uuid()::text,1,12),new.id,
      case when jsonb_typeof(step->'order')='number' then (step->>'order')::numeric else 1 end,
      step->>'title',coalesce(step->>'instruction',''),
      coalesce(step->>'phase_code',step->>'phaseCode'),
      case when jsonb_typeof(coalesce(step->'target_temperature',step->'targetTemperature'))='number' then coalesce(step->>'target_temperature',step->>'targetTemperature')::numeric end,
      case when jsonb_typeof(coalesce(step->'minimum_temperature',step->'minimumTemperature'))='number' then coalesce(step->>'minimum_temperature',step->>'minimumTemperature')::numeric end,
      case when jsonb_typeof(coalesce(step->'maximum_temperature',step->'maximumTemperature'))='number' then coalesce(step->>'maximum_temperature',step->>'maximumTemperature')::numeric end,
      case when jsonb_typeof(coalesce(step->'duration_minutes',step->'durationMinutes'))='number' then coalesce(step->>'duration_minutes',step->>'durationMinutes')::numeric end,
      coalesce(step->>'mixing_method',step->>'mixingMethod'),
      coalesce(step->>'mixing_intensity',step->>'mixingIntensity'),
      coalesce(step->>'completion_criteria',step->>'completionCriteria'),
      case lower(step->>'critical') when 'true' then true when 'false' then false else false end,
      coalesce(step->>'operator_note',step->>'operatorNote'),'Pending',''
    );
  end loop;
  return new;
end $$;
create trigger snapshot_experiment_lab_process
after insert on public.lab_batches
for each row execute function public.snapshot_experiment_lab_process();
