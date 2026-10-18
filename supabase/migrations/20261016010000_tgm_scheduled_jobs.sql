-- Supabase Cron is available on the Free plan. All schedules use UTC.
-- The 12-month retention job is registered but inactive until TGM approves
-- its privacy, legal-hold, and operational policy. It can be toggled later.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'tgm-retention-12-months',
  '30 2 * * *',
  'select tgm_private.purge_expired_visits(200)'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'tgm-retention-12-months'),
  active := false
);

-- This job is harmless while every location has auto_close_enabled = false.
select cron.schedule(
  'tgm-auto-close',
  '*/15 * * * *',
  'select public.tgm_apply_auto_close(200)'
);

select cron.schedule(
  'tgm-rate-window-cleanup',
  '10 3 * * *',
  'select tgm_private.purge_rate_limit_windows()'
);

-- Supabase Cron retains job-run history unless explicitly pruned.
select cron.schedule(
  'tgm-cron-history-cleanup',
  '0 4 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '30 days'$$
);
