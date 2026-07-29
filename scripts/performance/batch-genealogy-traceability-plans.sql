\timing on
begin;

create temporary table perf_fg(
  workspace_id uuid not null, id bigint primary key, consumer_batch_code text not null,
  production_run_id bigint not null, packaging_run_id bigint not null, product_id bigint not null
);
create temporary table perf_released(
  workspace_id uuid not null, id bigint primary key, finished_goods_lot_id bigint not null,
  on_hand numeric not null, location text not null
);
create temporary table perf_raw_consumption(
  workspace_id uuid not null, inventory_lot_id bigint not null, production_run_id bigint not null,
  finished_goods_lot_id bigint not null, quantity numeric not null
);
create temporary table perf_packaging_consumption(
  workspace_id uuid not null, packaging_inventory_lot_id bigint not null, packaging_run_id bigint not null,
  finished_goods_lot_id bigint not null, quantity numeric not null
);
create temporary table perf_movements(workspace_id uuid not null,released_lot_id bigint not null,sequence bigint not null,quantity numeric not null);
create temporary table perf_events(workspace_id uuid not null,id bigint not null,root_id bigint not null,occurred_at timestamptz not null,event_type text not null);
create temporary table perf_supplier_lots(workspace_id uuid not null,lot_id bigint not null,supplier_lot text not null);

insert into perf_fg select '00000000-0000-0000-0000-000000000001',g,'KF-PERF-'||lpad(g::text,6,'0'),g,g,1+(g%1000) from generate_series(1,100000)g;
insert into perf_released select workspace_id,id,id,10,'Finished Goods / '||(id%20) from perf_fg;
insert into perf_raw_consumption select workspace_id,1+(g%250000),1+(g%100000),1+(g%100000),1 from generate_series(1,500000)g cross join (select '00000000-0000-0000-0000-000000000001'::uuid workspace_id)s;
insert into perf_packaging_consumption select workspace_id,1+(g%250000),1+(g%100000),1+(g%100000),1 from generate_series(1,500000)g cross join (select '00000000-0000-0000-0000-000000000001'::uuid workspace_id)s;
insert into perf_movements select workspace_id,1+(g%100000),g,case when g%7=0 then -1 else 1 end from generate_series(1,1000000)g cross join (select '00000000-0000-0000-0000-000000000001'::uuid workspace_id)s;
insert into perf_events select workspace_id,g,1+(g%100000),clock_timestamp()-(g||' milliseconds')::interval,'genealogy_event' from generate_series(1,1000000)g cross join (select '00000000-0000-0000-0000-000000000001'::uuid workspace_id)s;
insert into perf_supplier_lots select workspace_id,g,'SUP-'||lpad(g::text,7,'0') from generate_series(1,250000)g cross join (select '00000000-0000-0000-0000-000000000001'::uuid workspace_id)s;

create index on perf_fg(workspace_id,consumer_batch_code,id);
create index on perf_fg(workspace_id,production_run_id,packaging_run_id,id);
create index on perf_released(workspace_id,finished_goods_lot_id,id);
create index on perf_raw_consumption(workspace_id,inventory_lot_id,production_run_id,finished_goods_lot_id);
create index on perf_packaging_consumption(workspace_id,packaging_inventory_lot_id,packaging_run_id,finished_goods_lot_id);
create index on perf_movements(workspace_id,released_lot_id,sequence);
create index on perf_events(workspace_id,root_id,occurred_at,id);
create index on perf_supplier_lots(workspace_id,supplier_lot,lot_id);
analyze perf_fg; analyze perf_released; analyze perf_raw_consumption; analyze perf_packaging_consumption;
analyze perf_movements; analyze perf_events; analyze perf_supplier_lots;

\echo consumer_batch_search
explain(analyze,buffers) select * from perf_fg where workspace_id='00000000-0000-0000-0000-000000000001' and consumer_batch_code='KF-PERF-050000' order by id limit 25;
\echo finished_goods_backward_and_current_impact
explain(analyze,buffers) select f.id,r.id,sum(m.quantity) from perf_fg f left join perf_released r on r.workspace_id=f.workspace_id and r.finished_goods_lot_id=f.id left join perf_movements m on m.workspace_id=r.workspace_id and m.released_lot_id=r.id where f.workspace_id='00000000-0000-0000-0000-000000000001' and f.id=50000 group by f.id,r.id;
\echo raw_material_forward_trace
explain(analyze,buffers) select distinct on(f.id) f.id,f.consumer_batch_code,c.quantity from perf_raw_consumption c join perf_fg f on f.workspace_id=c.workspace_id and f.id=c.finished_goods_lot_id where c.workspace_id='00000000-0000-0000-0000-000000000001' and c.inventory_lot_id=50000 order by f.id;
\echo packaging_lot_forward_trace
explain(analyze,buffers) select distinct on(f.id) f.id,f.consumer_batch_code,c.quantity from perf_packaging_consumption c join perf_fg f on f.workspace_id=c.workspace_id and f.id=c.finished_goods_lot_id where c.workspace_id='00000000-0000-0000-0000-000000000001' and c.packaging_inventory_lot_id=50000 order by f.id;
\echo production_batch_and_packaging_run_trace
explain(analyze,buffers) select * from perf_fg where workspace_id='00000000-0000-0000-0000-000000000001' and production_run_id=50000 order by packaging_run_id,id;
\echo integrity_and_event_history
explain(analyze,buffers) select event_type,occurred_at from perf_events where workspace_id='00000000-0000-0000-0000-000000000001' and root_id=50000 order by occurred_at,id;
\echo supplier_lot_search
explain(analyze,buffers) select lot_id from perf_supplier_lots where workspace_id='00000000-0000-0000-0000-000000000001' and supplier_lot='SUP-0050000' order by lot_id limit 25;
\echo product_affected_lot_aggregation
explain(analyze,buffers) select product_id,count(*) from perf_fg where workspace_id='00000000-0000-0000-0000-000000000001' group by product_id order by product_id limit 25;

rollback;
