# Frontend remediation progress

The [master handoff](frontend-ui-remediation-handoff.md) remains the source of truth for scope, invariants, and acceptance. This file records implementation and release evidence.

## Baseline, 25 October 2026

- Local branch: `codex/frontend-ui-remediation`; pre-remediation checkout saved as local commit `038d0aa` and as a patch/archive under `/private/tmp/tgm-ui-baseline.F5UzP2`. Nothing has been pushed.
- Staging Supabase project: `btnfwljsnizhasxotatx` (confirmed by the user). Frontend host: Cloudflare Pages and Workers, subject to requirements. Production project and frontend URL are not yet identified.
- Staging has migrations through `20261022090113`. Local checkout and local database also have invitation migrations `20261023055347` and `20261023055448`; these have not been applied to staging. New migration `20261025091610` is local only.
- On 25 October, `supabase config diff` found that staging lacks the new `/auth/recover` redirect URLs and differs on the recovery email subject. CAPTCHA and password requirements did not appear in the diff; masked credential values and template content were not verified. The remote-only storage image transformation setting must be preserved when changing Auth configuration.
- Baseline `npm run typecheck` passed. The first remediation slice passes format, lint, both typechecks, unit tests, production build, six Playwright scenarios, Deno checks for its two new functions, and the invitation SQL regression against a local rollback transaction.

## Release gates

- Do not enable the new Auth recovery flow in staging until its Auth redirect allowlist, recovery email template, and `TGM_RECOVERY_INTENT_SECRET` are configured and verified there.
- Apply and validate the two pending invitation migrations before deploying the invitation preview migration and Edge Function.
- Reconcile generated database types against the intended deployed schema using the official CLI. The current CI hosted-type comparison targets a repository variable whose project value still needs confirmation.
- No staging or production deployment, remote Git push, or live legacy-object deletion has occurred.
