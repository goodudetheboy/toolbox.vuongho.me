# 0009. Strategy-first tracking: tasks, check-ins and revising a plan

Status: Accepted

## Context

The signed-in tab was a list of accounts. The user wanted to build around
*executing strategies* instead: see the active strategies and, for each one,
the progress so far, today's tasks, the money collected and the whole plan
as a timeline. When something due gets neglected, there should be a way to
correct course. They also want daily email updates, but asked to leave
email for later.

## Decision

- The tab becomes **My plans**: today's tasks across all active plans, the
  active plans (progress bar, day X of Y, tasks today, overdue count),
  finished/archived plans, "Banks I have", and accounts outside a plan.
  Each plan opens a tracker page at `/accounts/<savedId>` (a page, not a
  modal: you come back to it daily and it's long).
- **Tasks are derived, not stored** (`tasks.ts`). Each account's planned
  dates give: open, each direct deposit, park cash / unpark, transactions,
  requirements met, bonus posts, and (optional) safe to close. Only the done
  marks are stored (`account.done[key]`, plus the status fields that already
  existed). So a revision that moves dates can't leave stale task records
  behind.
- **Check-in:** "action" tasks (open, deposit, park, transactions) that are
  past due and not done are *neglected*. The tracker lists them with Done
  buttons and a **Revise plan** button. Late bank-side items (bonus not
  posted yet) show under "Waiting on the bank" and don't trigger a revise.
- **Revise** (`planner.revisePlan`, `revise.ts`) re-plans from today:
  - accounts already opened are kept. Their undone deposits are re-scheduled
    on upcoming paychecks before each one's deadline (open date + the deal's
    DD window). Any that can't fit are flagged "at risk", scheduled
    best-effort, and never block new picks;
  - everything not opened yet is re-picked with the plan's own objective,
    pace and settings, around the paycheck the kept accounts still use, and
    skipping banks you have elsewhere;
  - a preview (planned total before → after, and each change) is shown
    first. Applying writes one batch and appends to `strategy.revisions`.
- Saved strategies now store the full settings they were built with
  (`planId`, `inputs`, `baselineApy`, `endsOn`), so they can be re-planned.
  Plans saved earlier fall back to defaults plus the few fields they kept
  (`revise.planSettings`).

## Consequences

- There's no schema migration. Old accounts just have no `done` map, and
  their deposit tasks count as done once the account is past "open".
- Revising can drop accounts not opened yet, and add new ones, if they no
  longer fit. The preview says which.
- **Email later:** the same `tasksForStrategy` / `neglected` functions can
  run in a scheduled job (the scheduled deploy workflow already has Google Cloud
  credentials). Still undecided: the sending provider and who may opt in.

## Addendum (same day): editing a running plan's settings

The tracker's **Edit settings** opens a sheet with the plan's goal, pace,
paycheck, next payday, length (counted from the plan's original start),
cash, splits, lead days, minimum bonus, options and banks to leave out.
Saving *is* a revision: `previewRevision(..., edited)` re-plans from today
with the new settings. As you edit, a live preview shows the planned total
before → after and every change. Applying writes the accounts and the
strategy's new settings (`inputs`, `planId`, `name`, `endsOn`…) in one
batch, and renames the plan on its accounts if the goal or pace changed.

Refinement found while testing: opened accounts that are **on track** (no
missed deposit, still on the payday grid) now keep their exact deposits as
fixed reservations (`Selection.fixed` in the planner). Only accounts with
missed deposits get rescheduled. Without this, any edit, or even a no-op
revise, re-split healthy accounts' deposits, which was noise. Tested in
`planner.test.ts`.

## Addendum (2026-10-17): accounts and money first, schedule folded

The tracker showed the same task list three times (Today, Next two weeks,
The whole plan), and each account was a collapsed row at the bottom. The
user found that "showing only the schedule is less than productive". Now,
after Today and the check-in, the page answers the money questions
(`src/lib/bag.ts`, pure, derived from the accounts like `tasks.ts`):

- **Next paycheck**: the next payday with something to route, each bank's
  share, the rest to main (`nextPaycheck`).
- **Cash parked now**: bonus and fee-waiver balances there now, ready to
  come out, or still to move in (`parkedCash`).
- **Accounts** as cards, overdue first then by stage: stage, direct
  deposits landed vs planned, key dates, next step; a card opens to its
  steps, the "keep up while it's open" extras (was the separate Don't
  forget box) and the record form (`accountCards`).
- **Full schedule** folded behind a disclosure; Next two weeks is gone.
- **See the plan overview** opens the Plan tab's own `StrategyDetail` in a
  sheet, so the plan looks like what you picked. It's rebuilt from the
  saved accounts (`savedAsStrategy`: current dates, revisions included,
  received bonuses counted as received), not re-planned from the inputs,
  which would drift as deals change.
- My Bag's plan cards also show the plan's next step (`nextStepOf`).
