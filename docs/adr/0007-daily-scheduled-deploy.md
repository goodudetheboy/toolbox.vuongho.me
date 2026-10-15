# 0007. The deploy workflow also runs on a schedule (and on demand), for build-time data

Status: Accepted; amended 2026-10-15: weekly instead of daily (see the end).
The filename still says "daily" so existing links keep working.

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

## Amendment (2026-10-15): weekly, Mondays

At the user's request, the schedule is now weekly, `17 11 * * 1` (Mondays
11:17 UTC, about 7am US Eastern; 6am in winter). Daily freshness wasn't
needed. Doctor of Credit's list changes a few times a week, and every push
to `main` still refreshes the deals in between. Deal end dates and "ending
soon" are computed in the browser against today's date, so they stay right
during the week; only brand-new or newly ended deals can lag by up to a
week. Cost wasn't the reason: the runs were already free (public repo,
standard runners) and well inside Hosting's free storage.

Still true: GitHub disables schedules on public repos after 60 days without
repository activity, so a quiet repo needs the schedule re-enabled in the
Actions tab.
