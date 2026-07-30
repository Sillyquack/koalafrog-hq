\set workspace_id '00000000-0000-0000-0000-000000000001'
\set finished_goods_lot_id '00000000-0000-0000-0000-000000000002'
\set released_inventory_lot_id '00000000-0000-0000-0000-000000000003'

-- Run against a representative generated fixture: 25k lots, 250k inspections,
-- 50k deviations, 75k reviews, 50k released lots, 250k movements.
explain(analyze,buffers) select * from public.finished_goods_inspections
 where workspace_id=:'workspace_id'::uuid and finished_goods_lot_id=:'finished_goods_lot_id'::uuid
 order by requirement_code,revision desc;
explain(analyze,buffers) select * from public.finished_goods_deviations
 where workspace_id=:'workspace_id'::uuid and finished_goods_lot_id=:'finished_goods_lot_id'::uuid
 and status in('open','under_review');
explain(analyze,buffers) select decision,sum(quantity) from public.finished_goods_disposition_reviews
 where workspace_id=:'workspace_id'::uuid and finished_goods_lot_id=:'finished_goods_lot_id'::uuid group by decision;
explain(analyze,buffers) select * from public.released_finished_goods_inventory_lots
 where workspace_id=:'workspace_id'::uuid and finished_goods_lot_id=:'finished_goods_lot_id'::uuid order by released_at;
explain(analyze,buffers) select coalesce(sum(normalized_quantity),0) from public.finished_goods_inventory_movements
 where workspace_id=:'workspace_id'::uuid and released_inventory_lot_id=:'released_inventory_lot_id'::uuid;
explain(analyze,buffers) select * from public.released_finished_goods_inventory_lots
 where workspace_id=:'workspace_id'::uuid and consumer_batch_code='KF-PERF-0001';
explain(analyze,buffers) select * from public.finished_goods_quality_events
 where workspace_id=:'workspace_id'::uuid and finished_goods_lot_id=:'finished_goods_lot_id'::uuid order by occurred_at,id;
