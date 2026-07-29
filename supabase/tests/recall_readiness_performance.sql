\set ON_ERROR_STOP on
begin;
select plan(10);

create temporary table perf_recall_cases(id bigint primary key,workspace_id integer,state text,updated_at timestamptz);
insert into perf_recall_cases select n,1,case when n%3=0 then 'awaiting_review' else 'draft' end,now()-(n||' seconds')::interval from generate_series(1,25000)n;
create index perf_recall_cases_list on perf_recall_cases(workspace_id,updated_at desc,id desc);

create temporary table perf_recall_revisions(id bigint primary key,workspace_id integer,case_id bigint,revision_number integer,fingerprint text);
insert into perf_recall_revisions select n,1,1+(n%25000),1+(n%4),md5(n::text) from generate_series(1,100000)n;
create index perf_recall_revision_case on perf_recall_revisions(workspace_id,case_id,revision_number desc);

create temporary table perf_recall_scopes(id bigint primary key,workspace_id integer,case_id bigint,revision_id bigint,fingerprint text);
insert into perf_recall_scopes select n,1,1+(n%25000),n,md5(('scope'||n)::text) from generate_series(1,100000)n;
create index perf_recall_scope_revision on perf_recall_scopes(workspace_id,revision_id);

create temporary table perf_recall_nodes(id bigint primary key,scope_id bigint,node_type text,immutable_id text);
insert into perf_recall_nodes select n,1+(n%100000),(array['raw','batch','output','run','finished'])[1+(n%5)],n::text from generate_series(1,1000000)n;
create index perf_recall_nodes_scope on perf_recall_nodes(scope_id,node_type,immutable_id);

create temporary table perf_recall_edges(id bigint primary key,scope_id bigint,from_id text,to_id text);
insert into perf_recall_edges select n,1+(n%100000),n::text,(n+1)::text from generate_series(1,1500000)n;
create index perf_recall_edges_scope on perf_recall_edges(scope_id,from_id,to_id);

create temporary table perf_recall_affected(id bigint primary key,scope_id bigint,finished_goods_lot_id bigint,unit text,on_hand numeric);
insert into perf_recall_affected select n,1+(n%100000),1+(n%200000),'pcs',n%100 from generate_series(1,500000)n;
create index perf_recall_affected_scope on perf_recall_affected(scope_id,finished_goods_lot_id);

create temporary table perf_recall_impacts(id bigint primary key,scope_id bigint,released_lot_id bigint,location text,on_hand numeric);
insert into perf_recall_impacts select n,1+(n%100000),1+(n%300000),'FG-'||(n%25),n%100 from generate_series(1,500000)n;
create index perf_recall_impacts_scope on perf_recall_impacts(scope_id,released_lot_id);

create temporary table perf_recall_events(id bigint primary key,workspace_id integer,case_id bigint,occurred_at timestamptz);
insert into perf_recall_events select n,1,1+(n%25000),now()-(n||' milliseconds')::interval from generate_series(1,500000)n;
create index perf_recall_events_case on perf_recall_events(workspace_id,case_id,occurred_at,id);

analyze perf_recall_cases; analyze perf_recall_revisions; analyze perf_recall_scopes; analyze perf_recall_nodes;
analyze perf_recall_edges; analyze perf_recall_affected; analyze perf_recall_impacts; analyze perf_recall_events;

\echo 'CASE LIST 25,000'
explain(analyze,buffers) select * from perf_recall_cases where workspace_id=1 order by updated_at desc,id desc limit 50;
select pass('case list plan executes against 25,000 cases');
\echo 'CASE DETAIL'
explain(analyze,buffers) select * from perf_recall_cases where workspace_id=1 and id=12500;
select pass('case detail plan executes');
\echo 'REVISION LIST 100,000'
explain(analyze,buffers) select * from perf_recall_revisions where workspace_id=1 and case_id=12500 order by revision_number desc;
select pass('revision list plan executes against 100,000 revisions');
\echo 'SCOPE GENERATION NODE LOOKUP 1,000,000'
explain(analyze,buffers) select * from perf_recall_nodes where scope_id=50000 order by node_type,immutable_id;
select pass('scope node plan executes against 1,000,000 nodes');
\echo 'SCOPE EDGE LOOKUP 1,500,000'
explain(analyze,buffers) select * from perf_recall_edges where scope_id=50000 order by from_id,to_id;
select pass('scope edge plan executes against 1,500,000 edges');
\echo 'AFFECTED GOODS 500,000'
explain(analyze,buffers) select unit,sum(on_hand) from perf_recall_affected where scope_id=50000 group by unit;
select pass('affected-goods plan executes against 500,000 rows');
\echo 'INVENTORY IMPACT 500,000'
explain(analyze,buffers) select * from perf_recall_impacts where scope_id=50000 order by released_lot_id;
select pass('inventory-impact plan executes against 500,000 rows');
\echo 'LIVE COMPARISON'
explain(analyze,buffers) select frozen.released_lot_id,frozen.on_hand,live.on_hand from perf_recall_impacts frozen join perf_recall_impacts live using(released_lot_id) where frozen.scope_id=50000 and live.scope_id=50001;
select pass('live-comparison join plan executes');
\echo 'REVISION COMPARISON'
explain(analyze,buffers) select coalesce(l.finished_goods_lot_id,r.finished_goods_lot_id) from perf_recall_affected l full join perf_recall_affected r on r.scope_id=50001 and r.finished_goods_lot_id=l.finished_goods_lot_id where l.scope_id=50000;
select pass('revision-comparison plan executes');
\echo 'EVENT HISTORY 500,000'
explain(analyze,buffers) select * from perf_recall_events where workspace_id=1 and case_id=12500 order by occurred_at,id;
select pass('event-history plan executes against 500,000 events');

select * from finish();
rollback;
