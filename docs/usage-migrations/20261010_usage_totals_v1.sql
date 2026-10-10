-- USAGE-1
-- Anonymous aggregate launch counters for Seating and Hanja only.
-- No account, school, student, IP, browser identifier, or per-session row is stored.

create table if not exists public.app_usage_totals (
  app_key text primary key
    check (app_key in ('SEATING', 'HANJA')),
  launch_count bigint not null default 0
    check (launch_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.app_usage_totals(app_key, launch_count)
values
  ('SEATING', 0),
  ('HANJA', 0)
on conflict (app_key) do nothing;

alter table public.app_usage_totals enable row level security;

revoke all on table public.app_usage_totals from public, anon, authenticated;

create or replace function public.record_app_usage_v1(p_app_key text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_key text;
  v_count bigint;
begin
  v_key := upper(btrim(coalesce(p_app_key, '')));

  if v_key not in ('SEATING', 'HANJA') then
    raise exception 'APP_USAGE_INVALID';
  end if;

  update public.app_usage_totals
  set launch_count = launch_count + 1,
      updated_at = clock_timestamp()
  where app_key = v_key
  returning launch_count into v_count;

  if not found then
    raise exception 'APP_USAGE_INVALID';
  end if;

  return v_count;
end;
$function$;

create or replace function public.get_app_usage_totals_v1()
returns table(app_key text, launch_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select t.app_key, t.launch_count
  from public.app_usage_totals t
  where t.app_key in ('SEATING', 'HANJA')
  order by case t.app_key when 'SEATING' then 1 else 2 end;
$function$;

revoke all on function public.record_app_usage_v1(text) from public, anon, authenticated;
revoke all on function public.get_app_usage_totals_v1() from public, anon, authenticated;

grant execute on function public.record_app_usage_v1(text) to anon, authenticated;
grant execute on function public.get_app_usage_totals_v1() to anon, authenticated;
