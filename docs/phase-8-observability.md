# Phase 8 observability and performance notes

The handoff in `frontend-ui-remediation-handoff.md` is the acceptance contract. These are local measurements and deployment checks, not evidence of hosted behavior.

## Sanitized logs

- Unexpected Edge failures log `event=edge_failure`, a random correlation ID, `environment`, and `release`. The response returns that ID without exception text, stack, tokens, email bodies, or visitor fields.
- The public `log-client-failure` Edge operation accepts only a fixed area, fixed failure kind, and UUID. It rejects extra fields and uses the existing database rate limiter: 20 reports per five-minute IP hash. `CLIENT_DIAGNOSTICS_RATE_SECRET` is server-only and must be configured before enabling this function. Browser rendering and reception Realtime failures use this endpoint; a reporting failure never blocks the original workflow.
- Set server-only `APP_ENV` to `staging` or `production`, and `APP_RELEASE` to a safe release identifier. Missing or malformed values appear as `unknown`. Search Supabase Function logs by correlation ID; correlate with Cloudflare request time and release. Log retention and access permissions must be reviewed in the selected hosting account.
- Outbound alert delivery remains disabled because no alert destination has been approved. Before production promotion, name an owner and destination, configure a rule for repeated `edge_failure`, `client_failure`, failed Cron runs, and sustained Realtime fallback, and test delivery without visitor data.

## Local measurement, 26 October 2026

- Synthetic report fixture: 1,003 matching visits, plus one same-tenant visit outside the branch-local day, all inside a transaction that rolled back. The old broad visit-row scan read approximately **160,624 PostgreSQL row bytes** for 1,004 candidate visits. Its first 1,000-row SQL page took **0.606 ms** in one local `EXPLAIN (ANALYZE, BUFFERS)` run. The database aggregate RPC returned approximately **824 PostgreSQL bytes** and took **3.377 ms** in the same run. These are database-only, single-run figures; they exclude old Edge pagination, row transfer, JavaScript aggregation, network latency, and CSV output. They do not establish end-to-end speed or hosted capacity.
- Reception refresh unit instrumentation models one completed local action plus ten Realtime invalidations. The previous action path invalidated queue and counts directly, then the broadcast debounce invalidated them again: **four cache invalidation calls**. The shared scheduler now coalesces the burst into **two calls**, one each for queue and counts. This is a local model, not a measured hosted database query count.
- In staging, capture actual RPC requests per branch over a fixed 10-minute period before and after enabling the updated client, including manual refresh and disconnected fallback. Record active visitor count, number of broadcasts, queue RPC calls, report range/branch count, report response time, and aggregate RPC execution time. Compare like-for-like traffic and investigate regressions before production promotion.

## Release gates

The staging and production frontend currently share one Supabase project, so Edge versions, secrets, logs, and database state are not isolated. No phase 8 function or configuration has been deployed. Verify `APP_ORIGIN`, `CLIENT_DIAGNOSTICS_RATE_SECRET`, `APP_ENV`, `APP_RELEASE`, private Realtime authorization, Cron cadence and failures, and approved alert delivery in the intended target before enabling diagnostics or promoting production traffic. Do not use visitor names, phone numbers, tokens, email bodies, or unredacted exception text in alerts.
