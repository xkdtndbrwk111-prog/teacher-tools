-- Launch metrics V2 — PREPARATION ONLY.
-- Fresh counters start at ZERO. Legacy app_usage_totals is intentionally ignored.
-- DO NOT turn on counting until the owner announces the public launch.
-- Scope: anonymous aggregate counts, no student/school/IP/device records.

create table if not exists public.launch_metrics_control_v2 (
  singleton text primary key default 'main' check (singleton = 'main'),
  enabled boolean not null default false,
  enabled_at timestamptz
);
insert into public.launch_metrics_control_v2(singleton, enabled, enabled_at)
values ('main', false, null)
on conflict (singleton) do nothing;

create table if not exists public.launch_metric_totals_v2 (
  metric text primary key check (metric in ('classroom_visit', 'hoja_download', 'hoja_update')),
  total_count bigint not null default 0 check (total_count >= 0)
);
insert into public.launch_metric_totals_v2(metric, total_count)
values ('classroom_visit', 0), ('hoja_download', 0), ('hoja_update', 0)
on conflict (metric) do nothing;

create table if not exists public.launch_metric_daily_v2 (
  metric text not null check (metric = 'classroom_visit'),
  day_kst date not null,
  visit_count bigint not null default 0 check (visit_count >= 0),
  primary key(metric, day_kst)
);

-- Random, per-update-operation receipts only: no hardware or user identifiers.
-- Deduplication is for confirmed successful update reports, never update checks.
create table if not exists public.launch_hoja_update_receipts_v2 (
  receipt_id uuid primary key,
  received_at timestamptz not null default now()
);

alter table public.launch_metrics_control_v2 enable row level security;
alter table public.launch_metric_totals_v2 enable row level security;
alter table public.launch_metric_daily_v2 enable row level security;
alter table public.launch_hoja_update_receipts_v2 enable row level security;
revoke all on public.launch_metrics_control_v2 from public, anon, authenticated;
revoke all on public.launch_metric_totals_v2 from public, anon, authenticated;
revoke all on public.launch_metric_daily_v2 from public, anon, authenticated;
revoke all on public.launch_hoja_update_receipts_v2 from public, anon, authenticated;

-- Only expose the four requested aggregate numbers; do not expose event rows.
create or replace function public.get_launch_metrics_v2()
returns table(
  enabled boolean,
  classroom_today bigint,
  classroom_total bigint,
  hoja_downloads bigint,
  hoja_updates bigint
)
language sql stable security definer
set search_path = ''
as $fn$
 select
  coalesce((select c.enabled from public.launch_metrics_control_v2 c where c.singleton='main'),false),
  coalesce((select d.visit_count from public.launch_metric_daily_v2 d
            where d.metric='classroom_visit'
              and d.day_kst=(now() at time zone 'Asia/Seoul')::date),0)::bigint,
  coalesce((select t.total_count from public.launch_metric_totals_v2 t where t.metric='classroom_visit'),0)::bigint,
  coalesce((select t.total_count from public.launch_metric_totals_v2 t where t.metric='hoja_download'),0)::bigint,
  coalesce((select t.total_count from public.launch_metric_totals_v2 t where t.metric='hoja_update'),0)::bigint;
$fn$;

-- Browser may record CLASSROOM and OFFICIAL DOWNLOAD only after manual launch.
-- This is deliberately NOT callable by anonymous users during preparation.
create or replace function public.record_public_launch_v2(p_metric text)
returns boolean
language plpgsql security definer
set search_path = ''
as $fn$
declare
  v_enabled boolean := false;
  v_day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_metric is null or p_metric not in ('classroom_visit','hoja_download') then
    return false;
  end if;
  select c.enabled into v_enabled
    from public.launch_metrics_control_v2 c where c.singleton='main';
  if not coalesce(v_enabled,false) then return false; end if;

  update public.launch_metric_totals_v2 t
     set total_count = total_count+1 where t.metric=p_metric;
  if p_metric='classroom_visit' then
    insert into public.launch_metric_daily_v2(metric,day_kst,visit_count)
    values ('classroom_visit',v_day,1)
    on conflict (metric,day_kst)
    do update set visit_count=public.launch_metric_daily_v2.visit_count+1;
  end if;
  return true;
end;
$fn$;

-- Trusted backend-only callback. Never expose a service-role key in the
-- static website or Windows client. Installers report ONLY after signed
-- update verification + successful restart, with one random event receipt.
create or replace function public.record_verified_hoja_update_v2(p_receipt_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $fn$
declare
  v_enabled boolean := false;
begin
  if p_receipt_id is null then return false; end if;
  select c.enabled into v_enabled
    from public.launch_metrics_control_v2 c where c.singleton='main';
  if not coalesce(v_enabled,false) then return false; end if;

  insert into public.launch_hoja_update_receipts_v2(receipt_id)
  values(p_receipt_id) on conflict (receipt_id) do nothing;
  if not found then return false; end if;
  update public.launch_metric_totals_v2 t
     set total_count=total_count+1 where t.metric='hoja_update';
  return true;
end;
$fn$;

revoke all on function public.get_launch_metrics_v2() from public, anon, authenticated;
revoke all on function public.record_public_launch_v2(text) from public, anon, authenticated;
revoke all on function public.record_verified_hoja_update_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_launch_metrics_v2() to anon, authenticated;
grant execute on function public.record_verified_hoja_update_v2(uuid) to service_role;

-- PRE-LAUNCH ASSERTIONS (run manually when the paused database is accessible):
-- select * from public.get_launch_metrics_v2(); -- false, 0, 0, 0, 0
-- select * from public.launch_metric_totals_v2; -- all 0
-- select count(*) from public.launch_metric_daily_v2; -- 0
-- select count(*) from public.launch_hoja_update_receipts_v2; -- 0
--
-- LAUNCH DAY ONLY (not executed by this migration):
-- 1) Verify all four values are zero.
-- 2) Wire the verified-updater callback into a trusted backend.
-- 3) update public.launch_metrics_control_v2
--       set enabled=true, enabled_at=now() where singleton='main';
-- 4) grant execute on function public.record_public_launch_v2(text) to anon,authenticated;
-- 5) Set launch-metrics-config.js enabled:true in a reviewed release.
-- 6) Only then set the official Hoja Board download URL in hub.js.
