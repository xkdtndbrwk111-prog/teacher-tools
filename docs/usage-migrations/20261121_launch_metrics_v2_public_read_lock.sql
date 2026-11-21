-- Release-day metrics remain private during preparation.
-- The four counters are readable by an authorized database administrator only.
-- No public reads or writes until an explicitly reviewed public launch.
revoke execute on function public.get_launch_metrics_v2() from public, anon, authenticated;

-- On launch day only, after deciding the display audience:
-- grant execute on function public.get_launch_metrics_v2() to anon, authenticated;
