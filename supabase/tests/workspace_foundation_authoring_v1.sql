begin;
select plan(22);

select col_is_null('public','supplier_products','price','Supplier Product price may be unknown');
select col_is_null('public','supplier_products','currency','Supplier Product currency may be unknown');
select col_is_null('public','supplier_products','package_quantity','Supplier Product package quantity may be unknown');
select col_is_null('public','supplier_products','package_unit','Supplier Product package unit may be unknown');
select has_column('public','supplier_products','price_state','Supplier Product records price knowledge explicitly');
select has_column('public','supplier_products','lifecycle_status','Supplier Product records lifecycle explicitly');

select has_column('public','packaging_components','specification_notes','Packaging supports draft specifications');
select has_column('public','packaging_components','sourcing_notes','Packaging supports sourcing notes');
select has_column('public','packaging_components','operational_notes','Packaging supports operational notes');
select has_column('public','packaging_components','ownership_state','Packaging ownership is explicit');
select has_column('public','packaging_components','stock_state','Packaging stock state is explicit');

select has_column('public','equipment_items','quantity','Equipment quantity is structured');
select has_column('public','equipment_items','primary_use','Equipment primary use is structured');
select has_column('public','equipment_items','calibration_status','Equipment calibration state is structured');
select has_column('public','equipment_items','calibration_note','Equipment calibration notes are structured');
select has_column('public','equipment_items','ownership_state','Equipment ownership is explicit');

select col_is_null('public','procurement_requested_items','requested_quantity','Procurement quantity may be undecided');
select col_is_null('public','procurement_requested_items','unit','Procurement unit may be undecided');
select has_column('public','procurement_requested_items','package_preference','Procurement package preference is structured');

select is(
  (select relrowsecurity from pg_class where oid='public.workspace_foundation_status_events'::regclass),
  true,
  'Foundation status history has RLS enabled'
);
select is(
  has_table_privilege('authenticated','public.workspace_foundation_status_events','INSERT'),
  false,
  'Foundation status history is not directly writable'
);
select is(
  has_function_privilege('authenticated','public.capture_workspace_foundation_status_event_v1()','EXECUTE'),
  false,
  'Status capture trigger has no authenticated execute privilege'
);

select * from finish();
rollback;
