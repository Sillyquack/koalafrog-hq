-- Generated from src/types/domain.ts by scripts/generate-relational-migration.mjs
alter table public.workspaces add column if not exists lifecycle_state text not null default 'empty' check (lifecycle_state in ('empty','importing','reconciliation_required','active','failed'));
grant select,insert,update on public.workspaces to authenticated;
grant select,insert,update on public.migration_runs to authenticated;
grant select,insert,update,delete on public.document_objects to authenticated;

create table public.products(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  name text not null,
  category text not null,
  status text not null,
  development_stage text not null,
  description text not null,
  current_development_formula_version_id text,
  current_approved_formula_version_id text,
  scent_profile text not null,
  target_launch_date text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.formulas(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  name text not null,
  description text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.formula_versions(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  formula_id text not null,
  version text not null,
  status text not null,
  description text not null,
  target_characteristics text not null,
  process_instructions text,
  development_notes text,
  approved_at text,
  created_at text not null,
  updated_at text not null,
  derived_from_version_id text,
  primary key (workspace_id,id)
);

create table public.formula_lines(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  formula_version_id text not null,
  ingredient_id text not null,
  percentage numeric not null,
  phase text not null,
  sort_order numeric not null,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.ingredients(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  common_name text not null,
  inci_name text not null,
  category text not null,
  functions text[] not null,
  description text not null,
  default_unit text not null,
  reorder_threshold numeric,
  notes text not null,
  status text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.supplier_products(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  ingredient_id text not null,
  supplier_name text not null,
  product_name text not null,
  supplier_sku text,
  package_quantity numeric not null check (package_quantity > 0),
  package_unit text not null,
  price numeric not null check (price > 0),
  currency text not null,
  product_url text,
  notes text not null,
  is_preferred boolean not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.inventory_lots(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  ingredient_id text not null,
  supplier_product_id text,
  internal_lot_number text not null,
  supplier_lot_number text,
  received_date text not null,
  opening_quantity numeric not null check (opening_quantity > 0),
  unit text not null,
  expiry_date text,
  best_before_date text,
  location text not null,
  status text not null,
  notes text not null,
  total_acquisition_cost numeric,
  acquisition_cost_currency text,
  cost_notes text,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id),
  unique (workspace_id,internal_lot_number)
);

create table public.inventory_movements(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  inventory_lot_id text not null,
  type text not null,
  quantity numeric not null check (quantity <> 0),
  unit text not null,
  reason text not null,
  reference_type text,
  reference_id text,
  notes text not null,
  occurred_at text not null,
  created_at text not null,
  primary key (workspace_id,id)
);

create table public.lab_batches(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  batch_number text not null,
  product_id text not null,
  formula_id text not null,
  formula_version_id text not null,
  status text not null,
  planned_batch_size numeric not null check (planned_batch_size > 0),
  planned_batch_unit text not null,
  started_at text,
  completed_at text,
  actual_yield numeric,
  yield_unit text,
  created_at text not null,
  updated_at text not null,
  purpose text not null,
  notes text not null,
  summary text not null,
  target_characteristics text not null,
  primary key (workspace_id,id),
  unique (workspace_id,batch_number)
);

create table public.lab_batch_lines(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  lab_batch_id text not null,
  formula_line_id text not null,
  ingredient_id text not null,
  ingredient_name_snapshot text not null,
  phase text not null,
  planned_percentage numeric not null,
  planned_quantity numeric not null check (planned_quantity > 0),
  actual_quantity numeric,
  unit text not null,
  variance numeric,
  notes text not null,
  status text not null,
  primary key (workspace_id,id)
);

create table public.lab_lot_allocations(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  lab_batch_line_id text not null,
  inventory_lot_id text,
  quantity numeric not null check (quantity <> 0),
  unit text not null,
  inventory_movement_id text,
  primary key (workspace_id,id)
);

create table public.lab_process_steps(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  lab_batch_id text not null,
  step_number numeric not null,
  instruction text not null,
  status text not null,
  completed_at text,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.lab_observations(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  lab_batch_id text not null,
  observation_type text not null,
  target_date text,
  observed_at text,
  appearance text not null,
  texture text not null,
  scent text not null,
  stability text not null,
  packaging text not null,
  notes text not null,
  rating numeric,
  created_at text not null,
  primary key (workspace_id,id)
);

create table public.testers(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  display_name text not null,
  notes text not null,
  status text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.test_templates(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  name text not null,
  description text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.test_sessions(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  lab_batch_id text not null,
  test_template_id text not null,
  name text not null,
  status text not null,
  created_at text not null,
  due_date text,
  completed_at text,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.test_responses(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  test_session_id text not null,
  tester_id text not null,
  overall_notes text not null,
  submitted_at text not null,
  primary key (workspace_id,id)
);

create table public.production_runs(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  production_run_number text not null,
  product_id text not null,
  formula_id text not null,
  formula_version_id text not null,
  status text not null,
  planned_batch_size numeric not null check (planned_batch_size > 0),
  planned_batch_unit text not null,
  planned_units numeric,
  actual_yield numeric,
  actual_yield_unit text,
  actual_units_produced numeric,
  started_at text,
  completed_at text,
  created_at text not null,
  updated_at text not null,
  purpose text not null,
  notes text not null,
  summary text not null,
  primary key (workspace_id,id),
  unique (workspace_id,production_run_number)
);

create table public.production_run_lines(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  production_run_id text not null,
  formula_line_id text not null,
  ingredient_id text not null,
  ingredient_name_snapshot text not null,
  phase text not null,
  planned_percentage numeric not null,
  planned_quantity numeric not null check (planned_quantity > 0),
  actual_quantity numeric,
  unit text not null,
  variance numeric,
  notes text not null,
  status text not null,
  primary key (workspace_id,id)
);

create table public.production_lot_allocations(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  production_run_line_id text not null,
  inventory_lot_id text,
  quantity numeric not null check (quantity <> 0),
  unit text not null,
  inventory_movement_id text,
  unit_cost_snapshot numeric,
  cost_currency_snapshot text,
  primary key (workspace_id,id)
);

create table public.production_process_steps(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  production_run_id text not null,
  step_number numeric not null,
  instruction text not null,
  status text not null,
  completed_at text,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.cost_lines(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  scope text not null,
  reference_id text not null,
  category text not null,
  description text not null,
  amount numeric not null,
  currency text not null,
  quantity numeric not null check (quantity <> 0),
  notes text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.packaging_components(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  name text not null,
  category text not null,
  description text not null,
  default_unit text not null,
  colour text not null,
  material text not null,
  capacity numeric,
  capacity_unit text,
  notes text not null,
  status text not null,
  reorder_threshold numeric,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.packaging_supplier_products(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  packaging_component_id text not null,
  supplier_name text not null,
  product_name text not null,
  supplier_sku text,
  package_quantity numeric not null check (package_quantity > 0),
  package_unit text not null,
  price numeric not null check (price > 0),
  currency text not null,
  product_url text,
  notes text not null,
  is_preferred boolean not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.packaging_inventory_lots(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  packaging_component_id text not null,
  packaging_supplier_product_id text,
  internal_lot_number text not null,
  supplier_lot_number text,
  received_date text not null,
  opening_quantity numeric not null check (opening_quantity > 0),
  unit text not null,
  location text not null,
  status text not null,
  notes text not null,
  total_acquisition_cost numeric,
  acquisition_cost_currency text,
  cost_notes text,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id),
  unique (workspace_id,internal_lot_number)
);

create table public.packaging_inventory_movements(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  packaging_inventory_lot_id text not null,
  type text not null,
  quantity numeric not null check (quantity <> 0),
  unit text not null,
  reason text not null,
  reference_type text,
  reference_id text,
  notes text not null,
  occurred_at text not null,
  created_at text not null,
  primary key (workspace_id,id)
);

create table public.packaging_specifications(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  name text not null,
  description text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.packaging_specification_versions(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  packaging_specification_id text not null,
  version text not null,
  status text not null,
  description text not null,
  notes text not null,
  created_at text not null,
  updated_at text not null,
  derived_from_version_id text,
  primary key (workspace_id,id)
);

create table public.packaging_specification_lines(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  packaging_specification_version_id text not null,
  packaging_component_id text not null,
  quantity_per_unit numeric not null check (quantity_per_unit > 0),
  unit text not null,
  sort_order numeric not null,
  purpose text not null,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.packaging_allocations(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  finished_goods_batch_id text not null,
  packaging_specification_line_id text not null,
  packaging_inventory_lot_id text,
  quantity numeric not null check (quantity <> 0),
  unit text not null,
  packaging_inventory_movement_id text,
  unit_cost_snapshot numeric,
  cost_currency_snapshot text,
  primary key (workspace_id,id)
);

create table public.finished_goods_batches(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  finished_goods_batch_number text not null,
  production_run_id text not null,
  product_id text not null,
  formula_version_id text not null,
  packaging_specification_version_id text,
  status text not null,
  production_date text not null,
  initial_quantity numeric not null check (initial_quantity > 0),
  unit text not null,
  notes text not null,
  created_at text not null,
  updated_at text not null,
  production_cost_per_unit_snapshot numeric,
  packaging_cost_snapshot numeric,
  cost_currency_snapshot text,
  primary key (workspace_id,id),
  unique (workspace_id,finished_goods_batch_number)
);

create table public.finished_goods_movements(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  finished_goods_batch_id text not null,
  type text not null,
  quantity numeric not null check (quantity <> 0),
  unit text not null,
  reason text not null,
  reference_type text,
  reference_id text,
  notes text not null,
  occurred_at text not null,
  created_at text not null,
  primary key (workspace_id,id)
);

create table public.responsible_persons(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  legal_name text not null,
  organisation_name text not null,
  physical_address text not null,
  country text not null,
  email text not null,
  phone text not null,
  status text not null,
  notes text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.compliance_dossiers(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  formula_version_id text not null,
  packaging_specification_version_id text,
  label_artwork_version_id text,
  responsible_person_id text,
  target_market text not null,
  target_language text not null,
  status text not null,
  internal_owner text not null,
  notes text not null,
  derived_from_dossier_id text,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.compliance_documents(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  document_type text not null,
  title text not null,
  version text not null,
  status text not null,
  linked_entity_type text not null,
  linked_entity_id text not null,
  issued_by text not null,
  author text not null,
  issue_date text,
  review_date text,
  expiry_date text,
  file_name text,
  external_reference text,
  external_url text,
  notes text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.regulatory_sources(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  title text not null,
  authority text not null,
  source_type text not null,
  jurisdiction text not null,
  external_url text not null,
  publication_date text,
  effective_date text,
  version_or_consolidation_date text,
  last_reviewed_at text,
  notes text not null,
  status text not null,
  primary key (workspace_id,id)
);

create table public.regulatory_reviews(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  subject_type text not null,
  subject_id text not null,
  compliance_dossier_id text not null,
  reviewed_at text,
  reviewed_by text not null,
  conclusion text not null,
  restriction_summary text not null,
  action_required text not null,
  notes text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.pif_evidence_sections(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  compliance_dossier_id text not null,
  area text not null,
  status text not null,
  owner text not null,
  reviewed_at text,
  notes text not null,
  missing_items_summary text not null,
  primary key (workspace_id,id)
);

create table public.cpsr_records(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  compliance_dossier_id text not null,
  status text not null,
  assessor_name text not null,
  assessor_organisation text not null,
  credential_document_id text,
  cpsr_document_id text,
  assessed_formula_version_id text not null,
  assessed_packaging_specification_version_id text,
  issued_date text,
  restrictions text not null,
  review_notes text not null,
  primary key (workspace_id,id)
);

create table public.label_artwork_versions(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  formula_version_id text not null,
  packaging_specification_version_id text,
  market text not null,
  language text not null,
  version text not null,
  status text not null,
  artwork_document_id text,
  created_at text not null,
  updated_at text not null,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.label_checklist_items(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  compliance_dossier_id text not null,
  item text not null,
  status text not null,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.inci_declarations(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  compliance_dossier_id text not null,
  version text not null,
  working_text text not null,
  final_text_snapshot text,
  unresolved_items text[] not null,
  status text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.claims(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  compliance_dossier_id text,
  claim_text text not null,
  market text not null,
  channel text not null,
  status text not null,
  evidence_summary text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.claim_evidence(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  claim_id text not null,
  document_id text,
  evidence_type text not null,
  relevance_notes text not null,
  reviewed_by text not null,
  reviewed_at text,
  primary key (workspace_id,id)
);

create table public.cpnp_records(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  compliance_dossier_id text not null,
  responsible_person_id text,
  status text not null,
  notification_date text,
  external_reference text,
  confirmation_document_id text,
  notes text not null,
  last_reviewed_at text,
  primary key (workspace_id,id)
);

create table public.readiness_issues(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  compliance_dossier_id text not null,
  category text not null,
  severity text not null,
  title text not null,
  description text not null,
  source_entity_type text,
  source_entity_id text,
  status text not null,
  resolved_at text,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.launch_plans(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  compliance_dossier_id text not null,
  target_market text not null,
  target_launch_date text not null,
  status text not null,
  owner text not null,
  notes text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.launch_milestones(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  launch_plan_id text not null,
  title text not null,
  kind text not null,
  status text not null,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.launch_decisions(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  launch_plan_id text not null,
  decision text not null,
  decided_at text not null,
  decided_by text not null,
  compliance_dossier_id text not null,
  unresolved_blocking_issues text[] not null,
  acknowledged_risks text not null,
  notes text not null,
  primary key (workspace_id,id)
);

create table public.undesirable_effect_records(
  workspace_id uuid not null,
  owner_id uuid not null,
  id text not null,
  product_id text not null,
  finished_goods_batch_id text,
  reported_at text not null,
  description text not null,
  reporter_reference text not null,
  seriousness_status text not null,
  internal_review_status text not null,
  external_notification_reference text,
  corrective_action_notes text not null,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id,id)
);

create table public.test_template_questions(workspace_id uuid not null,owner_id uuid not null,id text not null,test_template_id text not null,prompt text not null,type text not null,sort_order numeric not null,choices text[],primary key(workspace_id,id),foreign key(workspace_id,test_template_id) references public.test_templates(workspace_id,id) on delete cascade deferrable initially deferred);
create table public.test_response_answers(workspace_id uuid not null,owner_id uuid not null,test_response_id text not null,question_id text not null,value jsonb not null,primary key(workspace_id,test_response_id,question_id),foreign key(workspace_id,test_response_id) references public.test_responses(workspace_id,id) on delete cascade deferrable initially deferred,foreign key(workspace_id,question_id) references public.test_template_questions(workspace_id,id) deferrable initially deferred);
create table public.compliance_composition_snapshots(workspace_id uuid not null,owner_id uuid not null,compliance_dossier_id text not null,formula_line_id text not null,ingredient_id text not null,ingredient_name_snapshot text not null,inci_name_snapshot text not null,concentration numeric not null,primary key(workspace_id,compliance_dossier_id,formula_line_id),foreign key(workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) on delete cascade deferrable initially deferred,foreign key(workspace_id,formula_line_id) references public.formula_lines(workspace_id,id) deferrable initially deferred,foreign key(workspace_id,ingredient_id) references public.ingredients(workspace_id,id) deferrable initially deferred);

create table public.regulatory_review_sources(workspace_id uuid not null,owner_id uuid not null,regulatory_review_id text not null,regulatory_source_id text not null,primary key(workspace_id,regulatory_review_id,regulatory_source_id),foreign key(workspace_id,regulatory_review_id) references public.regulatory_reviews(workspace_id,id) on delete cascade deferrable initially deferred,foreign key(workspace_id,regulatory_source_id) references public.regulatory_sources(workspace_id,id) deferrable initially deferred);
create table public.pif_section_documents(workspace_id uuid not null,owner_id uuid not null,pif_section_id text not null,document_id text not null,primary key(workspace_id,pif_section_id,document_id),foreign key(workspace_id,pif_section_id) references public.pif_evidence_sections(workspace_id,id) on delete cascade deferrable initially deferred,foreign key(workspace_id,document_id) references public.compliance_documents(workspace_id,id) deferrable initially deferred);

alter table public.products add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.products add foreign key (workspace_id,current_development_formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.products add foreign key (workspace_id,current_approved_formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.formulas add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.formulas add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.formula_versions add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.formula_versions add foreign key (workspace_id,formula_id) references public.formulas(workspace_id,id) deferrable initially deferred;
alter table public.formula_versions add foreign key (workspace_id,derived_from_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.formula_lines add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.formula_lines add foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.formula_lines add foreign key (workspace_id,ingredient_id) references public.ingredients(workspace_id,id) deferrable initially deferred;
alter table public.ingredients add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.supplier_products add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.supplier_products add foreign key (workspace_id,ingredient_id) references public.ingredients(workspace_id,id) deferrable initially deferred;
alter table public.inventory_lots add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.inventory_lots add foreign key (workspace_id,ingredient_id) references public.ingredients(workspace_id,id) deferrable initially deferred;
alter table public.inventory_lots add foreign key (workspace_id,supplier_product_id) references public.supplier_products(workspace_id,id) deferrable initially deferred;
alter table public.inventory_movements add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.inventory_movements add foreign key (workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id) deferrable initially deferred;
alter table public.lab_batches add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.lab_batches add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.lab_batches add foreign key (workspace_id,formula_id) references public.formulas(workspace_id,id) deferrable initially deferred;
alter table public.lab_batches add foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.lab_batch_lines add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.lab_batch_lines add foreign key (workspace_id,lab_batch_id) references public.lab_batches(workspace_id,id) deferrable initially deferred;
alter table public.lab_batch_lines add foreign key (workspace_id,formula_line_id) references public.formula_lines(workspace_id,id) deferrable initially deferred;
alter table public.lab_batch_lines add foreign key (workspace_id,ingredient_id) references public.ingredients(workspace_id,id) deferrable initially deferred;
alter table public.lab_lot_allocations add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.lab_lot_allocations add foreign key (workspace_id,lab_batch_line_id) references public.lab_batch_lines(workspace_id,id) deferrable initially deferred;
alter table public.lab_lot_allocations add foreign key (workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id) deferrable initially deferred;
alter table public.lab_lot_allocations add foreign key (workspace_id,inventory_movement_id) references public.inventory_movements(workspace_id,id) deferrable initially deferred;
alter table public.lab_process_steps add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.lab_process_steps add foreign key (workspace_id,lab_batch_id) references public.lab_batches(workspace_id,id) deferrable initially deferred;
alter table public.lab_observations add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.lab_observations add foreign key (workspace_id,lab_batch_id) references public.lab_batches(workspace_id,id) deferrable initially deferred;
alter table public.testers add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.test_templates add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.test_sessions add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.test_sessions add foreign key (workspace_id,lab_batch_id) references public.lab_batches(workspace_id,id) deferrable initially deferred;
alter table public.test_sessions add foreign key (workspace_id,test_template_id) references public.test_templates(workspace_id,id) deferrable initially deferred;
alter table public.test_responses add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.test_responses add foreign key (workspace_id,test_session_id) references public.test_sessions(workspace_id,id) deferrable initially deferred;
alter table public.test_responses add foreign key (workspace_id,tester_id) references public.testers(workspace_id,id) deferrable initially deferred;
alter table public.production_runs add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.production_runs add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.production_runs add foreign key (workspace_id,formula_id) references public.formulas(workspace_id,id) deferrable initially deferred;
alter table public.production_runs add foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.production_run_lines add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.production_run_lines add foreign key (workspace_id,production_run_id) references public.production_runs(workspace_id,id) deferrable initially deferred;
alter table public.production_run_lines add foreign key (workspace_id,formula_line_id) references public.formula_lines(workspace_id,id) deferrable initially deferred;
alter table public.production_run_lines add foreign key (workspace_id,ingredient_id) references public.ingredients(workspace_id,id) deferrable initially deferred;
alter table public.production_lot_allocations add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.production_lot_allocations add foreign key (workspace_id,production_run_line_id) references public.production_run_lines(workspace_id,id) deferrable initially deferred;
alter table public.production_lot_allocations add foreign key (workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id) deferrable initially deferred;
alter table public.production_lot_allocations add foreign key (workspace_id,inventory_movement_id) references public.inventory_movements(workspace_id,id) deferrable initially deferred;
alter table public.production_process_steps add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.production_process_steps add foreign key (workspace_id,production_run_id) references public.production_runs(workspace_id,id) deferrable initially deferred;
alter table public.cost_lines add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_components add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_supplier_products add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_supplier_products add foreign key (workspace_id,packaging_component_id) references public.packaging_components(workspace_id,id) deferrable initially deferred;
alter table public.packaging_inventory_lots add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_inventory_lots add foreign key (workspace_id,packaging_component_id) references public.packaging_components(workspace_id,id) deferrable initially deferred;
alter table public.packaging_inventory_lots add foreign key (workspace_id,packaging_supplier_product_id) references public.packaging_supplier_products(workspace_id,id) deferrable initially deferred;
alter table public.packaging_inventory_movements add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_inventory_movements add foreign key (workspace_id,packaging_inventory_lot_id) references public.packaging_inventory_lots(workspace_id,id) deferrable initially deferred;
alter table public.packaging_specifications add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_specifications add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.packaging_specification_versions add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_specification_versions add foreign key (workspace_id,packaging_specification_id) references public.packaging_specifications(workspace_id,id) deferrable initially deferred;
alter table public.packaging_specification_versions add foreign key (workspace_id,derived_from_version_id) references public.packaging_specification_versions(workspace_id,id) deferrable initially deferred;
alter table public.packaging_specification_lines add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_specification_lines add foreign key (workspace_id,packaging_specification_version_id) references public.packaging_specification_versions(workspace_id,id) deferrable initially deferred;
alter table public.packaging_specification_lines add foreign key (workspace_id,packaging_component_id) references public.packaging_components(workspace_id,id) deferrable initially deferred;
alter table public.packaging_allocations add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.packaging_allocations add foreign key (workspace_id,finished_goods_batch_id) references public.finished_goods_batches(workspace_id,id) deferrable initially deferred;
alter table public.packaging_allocations add foreign key (workspace_id,packaging_specification_line_id) references public.packaging_specification_lines(workspace_id,id) deferrable initially deferred;
alter table public.packaging_allocations add foreign key (workspace_id,packaging_inventory_lot_id) references public.packaging_inventory_lots(workspace_id,id) deferrable initially deferred;
alter table public.packaging_allocations add foreign key (workspace_id,packaging_inventory_movement_id) references public.packaging_inventory_movements(workspace_id,id) deferrable initially deferred;
alter table public.finished_goods_batches add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.finished_goods_batches add foreign key (workspace_id,production_run_id) references public.production_runs(workspace_id,id) deferrable initially deferred;
alter table public.finished_goods_batches add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.finished_goods_batches add foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.finished_goods_batches add foreign key (workspace_id,packaging_specification_version_id) references public.packaging_specification_versions(workspace_id,id) deferrable initially deferred;
alter table public.finished_goods_movements add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.finished_goods_movements add foreign key (workspace_id,finished_goods_batch_id) references public.finished_goods_batches(workspace_id,id) deferrable initially deferred;
alter table public.responsible_persons add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id,packaging_specification_version_id) references public.packaging_specification_versions(workspace_id,id) deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id,label_artwork_version_id) references public.label_artwork_versions(workspace_id,id) deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id,responsible_person_id) references public.responsible_persons(workspace_id,id) deferrable initially deferred;
alter table public.compliance_dossiers add foreign key (workspace_id,derived_from_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.compliance_documents add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.regulatory_sources add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.regulatory_reviews add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.regulatory_reviews add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.pif_evidence_sections add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.pif_evidence_sections add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.cpsr_records add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.cpsr_records add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.cpsr_records add foreign key (workspace_id,credential_document_id) references public.compliance_documents(workspace_id,id) deferrable initially deferred;
alter table public.cpsr_records add foreign key (workspace_id,cpsr_document_id) references public.compliance_documents(workspace_id,id) deferrable initially deferred;
alter table public.cpsr_records add foreign key (workspace_id,assessed_formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.cpsr_records add foreign key (workspace_id,assessed_packaging_specification_version_id) references public.packaging_specification_versions(workspace_id,id) deferrable initially deferred;
alter table public.label_artwork_versions add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.label_artwork_versions add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.label_artwork_versions add foreign key (workspace_id,formula_version_id) references public.formula_versions(workspace_id,id) deferrable initially deferred;
alter table public.label_artwork_versions add foreign key (workspace_id,packaging_specification_version_id) references public.packaging_specification_versions(workspace_id,id) deferrable initially deferred;
alter table public.label_artwork_versions add foreign key (workspace_id,artwork_document_id) references public.compliance_documents(workspace_id,id) deferrable initially deferred;
alter table public.label_checklist_items add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.label_checklist_items add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.inci_declarations add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.inci_declarations add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.claims add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.claims add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.claims add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.claim_evidence add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.claim_evidence add foreign key (workspace_id,claim_id) references public.claims(workspace_id,id) deferrable initially deferred;
alter table public.claim_evidence add foreign key (workspace_id,document_id) references public.compliance_documents(workspace_id,id) deferrable initially deferred;
alter table public.cpnp_records add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.cpnp_records add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.cpnp_records add foreign key (workspace_id,responsible_person_id) references public.responsible_persons(workspace_id,id) deferrable initially deferred;
alter table public.cpnp_records add foreign key (workspace_id,confirmation_document_id) references public.compliance_documents(workspace_id,id) deferrable initially deferred;
alter table public.readiness_issues add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.readiness_issues add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.launch_plans add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.launch_plans add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.launch_plans add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.launch_milestones add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.launch_milestones add foreign key (workspace_id,launch_plan_id) references public.launch_plans(workspace_id,id) deferrable initially deferred;
alter table public.launch_decisions add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.launch_decisions add foreign key (workspace_id,launch_plan_id) references public.launch_plans(workspace_id,id) deferrable initially deferred;
alter table public.launch_decisions add foreign key (workspace_id,compliance_dossier_id) references public.compliance_dossiers(workspace_id,id) deferrable initially deferred;
alter table public.undesirable_effect_records add foreign key (workspace_id) references public.workspaces(id) on delete cascade deferrable initially deferred;
alter table public.undesirable_effect_records add foreign key (workspace_id,product_id) references public.products(workspace_id,id) deferrable initially deferred;
alter table public.undesirable_effect_records add foreign key (workspace_id,finished_goods_batch_id) references public.finished_goods_batches(workspace_id,id) deferrable initially deferred;

do $$ declare t text; begin foreach t in array array['products','formulas','formula_versions','formula_lines','ingredients','supplier_products','inventory_lots','inventory_movements','lab_batches','lab_batch_lines','lab_lot_allocations','lab_process_steps','lab_observations','testers','test_templates','test_sessions','test_responses','production_runs','production_run_lines','production_lot_allocations','production_process_steps','cost_lines','packaging_components','packaging_supplier_products','packaging_inventory_lots','packaging_inventory_movements','packaging_specifications','packaging_specification_versions','packaging_specification_lines','packaging_allocations','finished_goods_batches','finished_goods_movements','responsible_persons','compliance_dossiers','compliance_documents','regulatory_sources','regulatory_reviews','pif_evidence_sections','cpsr_records','label_artwork_versions','label_checklist_items','inci_declarations','claims','claim_evidence','cpnp_records','readiness_issues','launch_plans','launch_milestones','launch_decisions','undesirable_effect_records','test_template_questions','test_response_answers','compliance_composition_snapshots','regulatory_review_sources','pif_section_documents'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy owner_all on public.%I for all using (owner_id=auth.uid()) with check (owner_id=auth.uid())',t);execute format('revoke all on public.%I from anon',t);execute format('grant select,insert,update,delete on public.%I to authenticated',t);end loop;end $$;

create or replace function public.import_v9_relational(payload jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$ declare uid uuid:=auth.uid();wid uuid;run_id uuid:=gen_random_uuid();collection text;tbl text;row_data jsonb;counts jsonb:='{}';begin if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid for update;if wid is null then insert into workspaces(owner_id,name,lifecycle_state) values(uid,'Koalafrog HQ','importing') returning id into wid;elsif exists(select 1 from products where workspace_id=wid) then raise exception 'Remote workspace is not empty';else update workspaces set lifecycle_state='importing' where id=wid;end if;set constraints all deferred;
collection:='products';tbl:='products';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='formulas';tbl:='formulas';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='formulaVersions';tbl:='formula_versions';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='formulaLines';tbl:='formula_lines';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='ingredients';tbl:='ingredients';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='supplierProducts';tbl:='supplier_products';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='inventoryLots';tbl:='inventory_lots';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='inventoryMovements';tbl:='inventory_movements';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='labBatches';tbl:='lab_batches';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='labBatchLines';tbl:='lab_batch_lines';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='labBatchAllocations';tbl:='lab_lot_allocations';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='processSteps';tbl:='lab_process_steps';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='labObservations';tbl:='lab_observations';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='testers';tbl:='testers';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='testTemplates';tbl:='test_templates';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='testSessions';tbl:='test_sessions';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='testResponses';tbl:='test_responses';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='productionRuns';tbl:='production_runs';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='productionRunLines';tbl:='production_run_lines';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='productionRunAllocations';tbl:='production_lot_allocations';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='productionProcessSteps';tbl:='production_process_steps';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='costLines';tbl:='cost_lines';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingComponents';tbl:='packaging_components';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingSupplierProducts';tbl:='packaging_supplier_products';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingInventoryLots';tbl:='packaging_inventory_lots';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingInventoryMovements';tbl:='packaging_inventory_movements';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingSpecifications';tbl:='packaging_specifications';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingSpecificationVersions';tbl:='packaging_specification_versions';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingSpecificationLines';tbl:='packaging_specification_lines';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='packagingAllocations';tbl:='packaging_allocations';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='finishedGoodsBatches';tbl:='finished_goods_batches';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='finishedGoodsMovements';tbl:='finished_goods_movements';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='responsiblePersons';tbl:='responsible_persons';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='complianceDossiers';tbl:='compliance_dossiers';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='complianceDocuments';tbl:='compliance_documents';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='regulatorySources';tbl:='regulatory_sources';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='regulatoryReviews';tbl:='regulatory_reviews';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='pifSections';tbl:='pif_evidence_sections';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='cpsrRecords';tbl:='cpsr_records';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='labelArtworkVersions';tbl:='label_artwork_versions';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='labelReviewItems';tbl:='label_checklist_items';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='inciDrafts';tbl:='inci_declarations';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='claims';tbl:='claims';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='claimEvidence';tbl:='claim_evidence';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='cpnpRecords';tbl:='cpnp_records';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='readinessIssues';tbl:='readiness_issues';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='launchPlans';tbl:='launch_plans';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='launchMilestones';tbl:='launch_milestones';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='launchDecisions';tbl:='launch_decisions';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
collection:='safetyEffectRecords';tbl:='undesirable_effect_records';for row_data in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop row_data:=row_data||jsonb_build_object('workspace_id',wid,'owner_id',uid);execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',tbl,tbl) using row_data;end loop;counts:=counts||jsonb_build_object(collection,jsonb_array_length(coalesce(payload->collection,'[]')));
insert into test_template_questions select wid,uid,q->>'id',t->>'id',q->>'prompt',q->>'type',(q->>'sort_order')::numeric,array(select jsonb_array_elements_text(coalesce(q->'choices','[]'))) from jsonb_array_elements(coalesce(payload->'testTemplates','[]')) t cross join lateral jsonb_array_elements(coalesce(t->'questions','[]')) q;
insert into test_response_answers select wid,uid,r->>'id',a->>'question_id',a->'value' from jsonb_array_elements(coalesce(payload->'testResponses','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'answers','[]')) a;
insert into compliance_composition_snapshots select wid,uid,d->>'id',c->>'formula_line_id',c->>'ingredient_id',c->>'ingredient_name_snapshot',c->>'inci_name_snapshot',(c->>'concentration')::numeric from jsonb_array_elements(coalesce(payload->'complianceDossiers','[]')) d cross join lateral jsonb_array_elements(coalesce(d->'composition_snapshot','[]')) c;insert into regulatory_review_sources select wid,uid,r->>'id',jsonb_array_elements_text(coalesce(r->'source_ids','[]')) from jsonb_array_elements(coalesce(payload->'regulatoryReviews','[]')) r;insert into pif_section_documents select wid,uid,p->>'id',jsonb_array_elements_text(coalesce(p->'document_ids','[]')) from jsonb_array_elements(coalesce(payload->'pifSections','[]')) p;update workspaces set lifecycle_state='reconciliation_required',updated_at=now() where id=wid;insert into migration_runs(id,workspace_id,owner_id,source_version,state,stage,entity_counts,imported_counts,skipped_counts,warnings,errors,reconciliation,completed_at) values(run_id,wid,uid,'v9','Imported — Reconciliation Required','relational_import',counts,counts,'{}','[]','[]','{}',now());return jsonb_build_object('migrationRunId',run_id,'workspaceId',wid,'ownerId',uid,'counts',counts,'state','Imported — Reconciliation Required');exception when others then raise;end $$;revoke all on function public.import_v9_relational(jsonb) from public,anon;grant execute on function public.import_v9_relational(jsonb) to authenticated;
create or replace function public.complete_v9_reconciliation(run_id uuid,report jsonb) returns void language plpgsql security invoker set search_path=public,pg_temp as $$ begin if auth.uid() is null or coalesce((report->>'complete')::boolean,false)=false then raise exception 'A complete authenticated reconciliation report is required';end if;update migration_runs set state='Completed',stage='reconciliation',reconciliation=report,completed_at=now() where id=run_id and owner_id=auth.uid();if not found then raise exception 'Migration run not found';end if;end $$;revoke all on function public.complete_v9_reconciliation(uuid,jsonb) from public,anon;grant execute on function public.complete_v9_reconciliation(uuid,jsonb) to authenticated;
create or replace function public.record_v9_migration_failure(error_message text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$ declare uid uuid:=auth.uid();wid uuid;run_id uuid:=gen_random_uuid();begin if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid;if wid is null then insert into workspaces(owner_id,name,lifecycle_state) values(uid,'Koalafrog HQ','failed') returning id into wid;else update workspaces set lifecycle_state='failed',updated_at=now() where id=wid;end if;insert into migration_runs(id,workspace_id,owner_id,source_version,state,stage,errors,completed_at) values(run_id,wid,uid,'v9','Failed','relational_import',jsonb_build_array(error_message),now());return run_id;end $$;revoke all on function public.record_v9_migration_failure(text) from public,anon;grant execute on function public.record_v9_migration_failure(text) to authenticated;
