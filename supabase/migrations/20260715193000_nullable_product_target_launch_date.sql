alter table public.products
  alter column target_launch_date drop not null;

update public.products
set target_launch_date = null
where target_launch_date = '';
