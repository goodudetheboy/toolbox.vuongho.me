# 0007. The deploy workflow also runs daily (and on demand), for build-time data

Status: Accepted

## Context

churn-machine's deal data is fetched from Doctor of Credit at build time
(`apps/churn-machine/docs/adr/0001-deal-data-from-doc-rest-api.md`). Deploys
only happened on pushes to `main`, so the data would go stale whenever the
repo was quiet. A separate refresh-only workflow would duplicate the build +
combine + hosting deploy steps.

## Decision

- `.github/workflows/deploy.yml` also triggers on `schedule` (daily, 11:17
  UTC, about 7am US Eastern) and `workflow_dispatch`, with a `deploy`
  concurrency group so a push and the scheduled run never deploy at once.
- The study-assistant Cloud Run step skips non-push runs when the service
  already exists (they have no "before" commit to diff against, which
  previously meant "deploy").
- `npm run refresh -w apps/churn-machine` runs before `npm run build`; it
  never fails the job.

## Consequences

- Every app is rebuilt and redeployed daily even with no code change. The
  output is identical for every app except churn-machine's `deals.json`, so
  this is harmless, just a few CI minutes.
- Any future tool with build-time data can rely on the daily rebuild instead
  of adding its own workflow.
