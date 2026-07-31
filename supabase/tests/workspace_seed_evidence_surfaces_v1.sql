begin;
select plan(7);

select has_function('public','get_platform_migration_status_v1',array[]::text[]);
select function_privs_are(
  'public','get_platform_migration_status_v1',array[]::text[],
  'authenticated',array['EXECUTE']
);
select function_privs_are(
  'public','get_platform_migration_status_v1',array[]::text[],
  'anon',array[]::text[]
);
select is(
  (select prosecdef from pg_proc where oid='public.get_platform_migration_status_v1()'::regprocedure),
  true,
  'migration diagnostic is security definer only for protected catalogue read'
);
select is(
  (select proconfig[1] from pg_proc where oid='public.get_platform_migration_status_v1()'::regprocedure),
  'search_path=""',
  'migration diagnostic has an empty fixed search path'
);
select throws_ok(
  'select public.get_platform_migration_status_v1()',
  'P0001','AUTHENTICATION_REQUIRED',
  'migration diagnostic denies an unauthenticated caller'
);
select ok(
  pg_get_functiondef('public.get_platform_migration_status_v1()'::regprocedure)
    not like '%execute %'
    and pg_get_functiondef('public.get_platform_migration_status_v1()'::regprocedure)
      not like '%query%',
  'migration diagnostic accepts no arbitrary query surface'
);

select * from finish();
rollback;
