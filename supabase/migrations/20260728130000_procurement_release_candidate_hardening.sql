-- Release-candidate corrections only: preserve behavior while making arithmetic
-- promotion and immutable-trigger execution explicit.

alter function public.prevent_beard_log_mutation()
  set search_path=pg_catalog,public,pg_temp;

-- The scenario counters are integers, so PostgreSQL otherwise evaluates the
-- multiplication as int4 before assigning the result to numeric.
do $$
declare
  definition text;
  hardened text;
begin
  definition := pg_get_functiondef(
    'public.generate_production_procurement_scenarios(uuid,bigint)'::regprocedure
  );
  if position('supplier_count*1000000000' in definition)=0
    or position('missing_count*1000000000' in definition)=0
    or position('stale_data_count*100000000' in definition)=0 then
    raise exception 'Scenario ranking hardening target expressions were not found';
  end if;
  hardened := replace(
    replace(
      replace(
        definition,
        'supplier_count*1000000000',
        'supplier_count::numeric*1000000000::numeric'
      ),
      'missing_count*1000000000',
      'missing_count::numeric*1000000000::numeric'
    ),
    'stale_data_count*100000000',
    'stale_data_count::numeric*100000000::numeric'
  );
  execute hardened;
end
$$;
