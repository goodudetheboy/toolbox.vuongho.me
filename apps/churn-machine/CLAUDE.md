# CLAUDE.md — churn-machine

This file covers `apps/churn-machine` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

Bank account bonus churning, three tabs:

- **Deals** (public, read-only) — every deal on Doctor of Credit's
  [Best Bank Account Bonuses](https://www.doctorofcredit.com/best-bank-account-bonuses/)
  page and its linked post, parsed into structured fields (bonus, DD amount +
  window, balance to park + hold, transactions, end date, pull, ChexSystems,
  fees, early-close fee, payout time, promo code…), with a "worth it" net
  value, deterministic filters/sorts, and a link back to the DoC post on
  every deal.
- **Plan** (public) — biweekly paycheck + plan length (+ optional cash to
  park and constraints) → several candidate strategies (objective × pace),
  sortable/filterable, each with a by-account and by-paycheck schedule.
- **My accounts** (Google sign-in) — save a strategy as planned accounts,
  then track each account planned → open → requirements done → bonus
  received → closed; or track any deal / add one by hand.

Progressive disclosure is the design rule: a few chips and three inputs up
front, everything else behind "More filters" / "Tune the plan" / expanding a
row. UI text uses no em dashes (toolbox-wide preference, see root progress
2026-10-07).

## Architecture notes

- `scripts/refresh-deals.mjs` — fetches the index + posts through DoC's
  WordPress REST API (~8 requests) and writes `public/deals.json`. Runs in
  CI before every build and on the daily scheduled deploy; on failure it
  keeps the committed `deals.json`. See
  [ADR 0001](docs/adr/0001-deal-data-from-doc-rest-api.md).
  `CHURN_CACHE_DIR=/tmp/doc node scripts/refresh-deals.mjs` caches raw API
  responses so parser iterations don't re-hit DoC.
- `scripts/parse-deals.mjs` — all parsing, regex-only and deterministic.
  Unknown → `null` → UI says "see post"; never guess. Tested with real DoC
  snippets in `parse-deals.test.mjs`; when you fix a misread deal, add its
  text as a test.
- `src/lib/value.ts` — net value (bonus − interest forgone on parked cash at
  your savings APY − unavoidable fees), effort score, verdict, `ASSUMED`
  defaults (shown as "assumed" wherever used).
- `src/lib/filters.ts` — deal filters/sorts shared by Deals and the planner.
- `src/lib/planner.ts` — the scheduler. Greedy over paydays with full
  re-simulation on every tentative pick; see
  [ADR 0002](docs/adr/0002-planner-greedy-with-full-resimulation.md).
  Tested in `planner.test.ts` (invariants: DD met inside each window,
  paychecks never over-split, pace, cash cap, monthly buckets, determinism).
- `src/lib/accounts.ts` — Firestore (`toolbox-churn-machine` database):
  `users/{uid}/accounts`, `users/{uid}/strategies`; owner-only rules in
  `firestore.rules`. See [ADR 0003](docs/adr/0003-accounts-in-firestore.md).
- Installable PWA scoped to `/churn-machine/` (`vite.config.ts`,
  `src/components/UpdateToast.tsx`): shell precached, `deals.json`
  network-first, update on tap. See [ADR 0004](docs/adr/0004-installable-pwa.md).
  `public/icon.svg` is the source for every icon PNG.
- `src/lib/router.ts` — three real paths (`/`, `/plan`, `/accounts`) under
  `/churn-machine/`, served by the root `firebase.json` rewrite.

## Running

```bash
npm run dev:churn-machine             # from repo root
npm test -w apps/churn-machine        # parser + planner tests
npm run refresh -w apps/churn-machine # refresh public/deals.json from DoC
```

Testing the signed-in side locally without touching production data:
start the emulators (`firebase emulators:start --only firestore,auth` with
Firestore on 8085 and Auth on 9099, needs Java) and run
`VITE_FIREBASE_EMULATORS=1 npm run dev:churn-machine`. The Auth emulator's
fake Google popup works with Playwright.

## Docs

- `docs/adr/` — this tool's own decisions.
- `docs/progress/` — this tool's build log, one file per calendar day.
