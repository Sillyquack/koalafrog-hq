\set ON_ERROR_STOP on
begin;
create temporary table perf_finished_goods_lots(
  id bigint primary key, workspace_id integer not null, product_id integer not null,
  consumer_batch_code text not null, expiry_date date not null, released_at timestamptz not null,
  manufacturing_date date not null, unit_cost numeric
);
insert into perf_finished_goods_lots
select n,1,n%250,'PERF-'||n,current_date+(n%730),now()-(n||' seconds')::interval,current_date-(n%365),(n%1000)/100.0
from generate_series(1,100000)n;
create index perf_lots_fefo on perf_finished_goods_lots(workspace_id,product_id,expiry_date,released_at,manufacturing_date,id);
create index perf_lots_batch on perf_finished_goods_lots(workspace_id,consumer_batch_code);

create temporary table perf_finished_goods_movements(
  id bigint primary key, workspace_id integer not null, lot_id bigint not null,
  related_movement_id bigint, quantity numeric not null, occurred_at timestamptz not null
);
insert into perf_finished_goods_movements
select n,1,1+(n%100000),case when n%20=0 then n-1 end,case when n%7=0 then -1 else 1 end,now()-(n||' milliseconds')::interval
from generate_series(1,1000000)n;
create index perf_movements_lot on perf_finished_goods_movements(workspace_id,lot_id,occurred_at,id);
create index perf_movements_related on perf_finished_goods_movements(workspace_id,related_movement_id) where related_movement_id is not null;

create temporary table perf_finished_goods_states(
  id bigint primary key, workspace_id integer not null, lot_id bigint not null,
  state_type text not null, quantity_delta numeric not null, occurred_at timestamptz not null
);
insert into perf_finished_goods_states
select n,1,1+(n%100000),(array['held','blocked','damaged'])[1+(n%3)],case when n%2=0 then 1 else -1 end,now()-(n||' milliseconds')::interval
from generate_series(1,250000)n;
create index perf_states_lot on perf_finished_goods_states(workspace_id,lot_id,state_type,occurred_at,id);

create temporary table perf_finished_goods_events(
  id bigint primary key, workspace_id integer not null, lot_id bigint not null, occurred_at timestamptz not null
);
insert into perf_finished_goods_events select n,1,1+(n%100000),now()-(n||' milliseconds')::interval from generate_series(1,500000)n;
create index perf_events_lot on perf_finished_goods_events(workspace_id,lot_id,occurred_at,id);
analyze perf_finished_goods_lots; analyze perf_finished_goods_movements; analyze perf_finished_goods_states; analyze perf_finished_goods_events;

\echo 'BALANCE 1,000,000 movements'
explain(analyze,buffers) select sum(quantity) from perf_finished_goods_movements where workspace_id=1 and lot_id=50000;
\echo 'STATE 250,000 records'
explain(analyze,buffers) select state_type,sum(quantity_delta) from perf_finished_goods_states where workspace_id=1 and lot_id=50000 group by state_type;
\echo 'FEFO 100,000 lots'
explain(analyze,buffers) select * from perf_finished_goods_lots where workspace_id=1 and product_id=42 order by expiry_date,released_at,manufacturing_date,id limit 50;
\echo 'BATCH LOOKUP 100,000 lots'
explain(analyze,buffers) select * from perf_finished_goods_lots where workspace_id=1 and consumer_batch_code='PERF-50000';
\echo 'CORRECTION BASIS 1,000,000 movements'
explain(analyze,buffers) select sum(quantity) from perf_finished_goods_movements where workspace_id=1 and related_movement_id=50000;
\echo 'AUDIT 500,000 events'
explain(analyze,buffers) select * from perf_finished_goods_events where workspace_id=1 and lot_id=50000 order by occurred_at,id;
rollback;
