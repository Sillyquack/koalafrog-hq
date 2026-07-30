begin;

select plan(8);

select function_privs_are(
  'public',
  'enforce_batch_inventory_completion',
  array[]::text[],
  'postgres',
  array['EXECUTE'],
  'completion trigger helper is executable only by postgres'
);

select function_privs_are(
  'public',
  'enforce_batch_inventory_completion',
  array[]::text[],
  'service_role',
  array['EXECUTE'],
  'completion trigger helper remains available to service_role'
);

select function_privs_are(
  'public',
  'enforce_batch_inventory_completion',
  array[]::text[],
  'anon',
  array[]::text[],
  'completion trigger helper is unavailable to anon'
);

select function_privs_are(
  'public',
  'enforce_batch_inventory_completion',
  array[]::text[],
  'authenticated',
  array[]::text[],
  'completion trigger helper is unavailable to authenticated'
);

select function_privs_are(
  'public',
  'kf_finished_goods_inventory_snapshot_v1',
  array['uuid', 'uuid'],
  'postgres',
  array['EXECUTE'],
  'finished-goods snapshot helper is executable only by postgres'
);

select function_privs_are(
  'public',
  'kf_finished_goods_inventory_snapshot_v1',
  array['uuid', 'uuid'],
  'service_role',
  array['EXECUTE'],
  'finished-goods snapshot helper remains available to service_role'
);

select function_privs_are(
  'public',
  'kf_finished_goods_inventory_snapshot_v1',
  array['uuid', 'uuid'],
  'anon',
  array[]::text[],
  'finished-goods snapshot helper is unavailable to anon'
);

select function_privs_are(
  'public',
  'kf_finished_goods_inventory_snapshot_v1',
  array['uuid', 'uuid'],
  'authenticated',
  array[]::text[],
  'finished-goods snapshot helper is unavailable to authenticated'
);

select * from finish();
rollback;
