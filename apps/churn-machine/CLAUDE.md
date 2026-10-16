# CLAUDE.md — churn-machine

This file covers `apps/churn-machine` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

Bank account bonus churning, three tabs (Deals, Plan, My Bag):

- **Deals** (public, read-only) — every deal on Doctor of Credit's
  [Best Bank Account Bonuses](https://www.doctorofcredit.com/best-bank-account-bonuses/)
  page and its linked post, parsed into structured fields (bonus, DD amount +
  window, balance to park + hold, transactions, end date, pull, ChexSystems,
  fees, early-close fee, payout time, promo code…), with a "worth it" net
  value, deterministic filters/sorts, and a link back to the DoC post on
  every deal.
- **Plan** (public) — a few screens, one at a time (ADR 0011): your
  paycheck (amount, semi-monthly or every 2 weeks, start date, length) →
  "suggest plans for me" or "build my own" → the strategies (objective ×
  pace, or a custom plan of deals you picked, ADR 0010), each with a
  by-account and by-paycheck schedule.
- **My Bag** (Google sign-in; was "My plans") — strategy-first: the active strategies
  you saved, each with a tracker page (`/accounts/<savedId>`): what day of
  the plan it is, money collected, today's tasks, the next two weeks, the
  whole plan as a timeline, and a check-in that offers **Revise plan** when
  you've missed something. Accounts outside a plan and "Banks I have" sit
  below. See [ADR 0009](docs/adr/0009-strategy-first-tracking.md).

Progressive disclosure is the design rule: a few chips and three inputs up
front, everything else behind "More filters" / "More options" / a deal's
modal, and Plan goes one screen at a time (ADR 0011). Things you've chosen
(picked banks/deals) show as a list of tiles, not chips. The look copies Robinhood: white, one purple accent, Inter, big
numbers, pill buttons, hairline lists, a right-hand panel on desktop and a
bottom tab bar + bottom sheets on phones (see
[ADR 0006](docs/adr/0006-robinhood-look.md)). A deal row opens a modal with a
"Full page" link to `/deal/<id>` (see
[ADR 0005](docs/adr/0005-terminal-look-and-deal-modal.md)). UI text uses
no em dashes (toolbox-wide preference, see root progress 2026-10-07).

## Architecture notes

- `scripts/refresh-deals.mjs` — fetches the index + posts through DoC's
  WordPress REST API (~8 requests) and writes `public/deals.json`. Runs in
  CI before every build and on the weekly (Monday) scheduled deploy; on failure it
  keeps the committed `deals.json`. See
  [ADR 0001](docs/adr/0001-deal-data-from-doc-rest-api.md).
  `CHURN_CACHE_DIR=/tmp/doc node scripts/refresh-deals.mjs` caches raw API
  responses so parser iterations don't re-hit DoC.
- `data/deal-terms.json` + `scripts/deal-terms.mjs` — hand-checked terms
  for every deal as of 2026-10-16: the upfront bonus (what you get for the
  sign-up requirements), its requirement, and "later" money (a year+ of
  keeping deposits going, never counted), and "extras" (debit purchases,
  eStatements...) pinned on the plan page once an account is opened. Applied during refresh while a
  hash of the deal's terms text still matches; new or rewritten deals fall
  back to the parser, marked unchecked. To check one, read the post and
  add/update its entry (hash from `termsHash`). See
  [ADR 0012](docs/adr/0012-hand-checked-deal-terms.md).
- Monthly fees: `fee` in `data/deal-terms.json` (checked against posts and
  banks' sites, 2026-10-16), `feePlans` in `value.ts` (cheapest way to
  handle a fee: free / purchases / monthly direct deposit / kept balance /
  pay), and the planner routes waiver deposits and counts waiver balances.
  See [ADR 0014](docs/adr/0014-monthly-fees-in-the-planner.md).
- `scripts/ai-terms.mjs` — once a month (first Monday's scheduled refresh) and on manual runs, never on a push, Gemini (Vertex AI in
  `vuonghome`, no API key) reads deals whose terms are new or changed, with
  sanity checks; entries are saved with `by: "gemini"` and CI commits
  `deal-terms.json` back to main. Pages of those deals say "read by AI".
  `CHURN_AI_TERMS=0` skips it. See
  [ADR 0013](docs/adr/0013-gemini-checks-changed-deal-terms.md).
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
- `src/lib/tasks.ts` — the day-to-day tasks, derived from each account's
  planned dates (only "done" marks are stored, in `account.done`). Pure, so
  a future email job can reuse them. Tested in `tasks.test.ts`.
- `src/lib/revise.ts` + `planner.revisePlan` — "correct course": keeps the
  accounts you opened (missed deposits move onto upcoming paychecks; ones
  that can't make their deadline are flagged) and re-picks the rest from
  today with the same objective/pace. A preview is shown before it's written.
- `src/lib/accounts.ts` — Firestore (`toolbox-churn-machine` database):
  `users/{uid}/accounts`, `users/{uid}/strategies`; owner-only rules in
  `firestore.rules`. See [ADR 0003](docs/adr/0003-accounts-in-firestore.md).
- Installable PWA scoped to `/churn-machine/` (`vite.config.ts`,
  `src/components/UpdateToast.tsx`): shell precached, `deals.json`
  network-first, update on tap. See [ADR 0004](docs/adr/0004-installable-pwa.md).
  `public/icon.svg` is the source for every icon PNG.
- `src/lib/router.ts` — real paths (`/`, `/plan`, `/plan/<step>` for
  Plan's later screens (`how`, `suggested`, `pick`, `custom`), `/plan/<strategyId>`,
  `/accounts`, `/deal/<id>`) under `/churn-machine/`, served by the root `firebase.json`
  rewrite. `src/components/DealModal.tsx` has the shared `Sheet` (modal /
  bottom sheet, stackable), the deal modal and the full page. Strategies
  open in a `Sheet` at `/plan/<strategyId>?<inputs>`, a permalink that
  rebuilds the plan from its inputs (`src/lib/planLink.ts`, ADR 0008).
- Leaving banks out (ADR 0007): "Banks I have" lives in My accounts
  (Firestore `users/{uid}/profile/main.banksIHave`, plus every tracked
  account you opened). Deals and Plan share one `Exclusion` (built in
  `App.tsx`, UI in `ExcludeBanks` in `bits.tsx`): an "Exclude banks I
  already have" toggle plus an "Exclude banks" picker (localStorage).

## User guide: keep it current

`src/guide.md` is the user manual, shown in the app at `/guide` (from the
user menu in the top bar) by `GuidePage.tsx` (a small
markdown subset: `#`/`##`/`###`, paragraphs, `- ` lists, `> ` tips,
`**bold**`, `_italic_`, `` `code` ``, `[links](url)`).

**Any user-visible feature change updates the guide in the same commit**:
new features get a section or bullet, changed ones are re-described,
removed ones are deleted, and the "Last updated" date is bumped. Write it
for the user, not developers: what it does and where to find it, plain
words, no em dashes (UI text rule). If a change is too small to mention,
say so in the progress log instead of skipping silently.

## Running

```bash
npm run dev:churn-machine             # from repo root
npm test -w apps/churn-machine        # parser + planner tests
npm run refresh -w apps/churn-machine # refresh public/deals.json from DoC
```

Testing the signed-in side locally without touching production data:
start the emulators (`firebase emulators:start --only firestore,auth` with
Firestore on 8085 and Auth on 9099, needs Java; with no Java installed, a
portable Adoptium JRE tarball unpacked into /tmp works) and run
`VITE_FIREBASE_EMULATORS=1 npm run dev:churn-machine`. The Auth emulator's
fake Google popup works with Playwright.

## Docs

- `docs/adr/` — this tool's own decisions.
- `docs/progress/` — this tool's build log, one file per calendar day.
