-- Phase 8C: additive operational metadata only. Existing notes and rows remain intact.
alter table public.supplier_products
  add column grade text,
  add column supplier_grade text,
  add column declared_inci text,
  add column category_snapshot text,
  add column default_inventory_unit text,
  add column cosing_functions_snapshot text[] default '{}',
  add column research_profile_snapshot text,
  add column reference_entry_id text,
  add column country_code text,
  add column origin text,
  add column extraction_method text,
  add column processing_method text,
  add column shelf_life_months integer check(shelf_life_months is null or shelf_life_months > 0),
  add column storage_requirements text,
  add column product_status text default 'research'
    check(product_status in('research','reviewing','verified_operational','inactive','discontinued')),
  add column operational_notes text default '',
  add column verification_notes text default '',
  add column verification jsonb default
    '{"inci":"unknown","supplierSpecification":"unknown","sds":"unknown","coa":"unknown","allergenInformation":"unknown","shelfLife":"unknown","origin":"unknown","extractionMethod":"unknown","processingMethod":"unknown","ifra":"unknown","cosing":"unknown"}'::jsonb,
  add constraint supplier_products_verification_object check(verification is null or jsonb_typeof(verification)='object');

alter table public.suppliers
  add column verification_state text not null default 'unknown'
    check(verification_state in('unknown','needs_review','reviewed','rejected'));
