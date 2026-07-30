-- Hosted rehearsal advisors identified two internal SECURITY DEFINER helpers
-- that retained PostgreSQL's default PUBLIC execute privilege. Neither helper
-- is a client RPC: one is a trigger function and the other is called only by
-- controlled finished-goods RPCs.

revoke all on function public.enforce_batch_inventory_completion()
  from public, anon, authenticated;
grant execute on function public.enforce_batch_inventory_completion()
  to service_role;

revoke all on function public.kf_finished_goods_inventory_snapshot_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kf_finished_goods_inventory_snapshot_v1(uuid, uuid)
  to service_role;
