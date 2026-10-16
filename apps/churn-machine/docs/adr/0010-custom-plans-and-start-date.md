# 0010. Custom plans and a plan start date

Status: Accepted

## Context

The planner only suggested plans: it picked deals itself by goal × pace
(ADR 0002). The user also wants to name the banks they want and have the
planner fit all of them around their paychecks, and to start a plan on a
later date instead of today.

Options for custom plans: a separate "fit these" scheduler, or the same
greedy planner (ADR 0002) with a new objective whose candidate list is
just the picks. The second reuses everything downstream (strategy modal,
permalinks, saving, tracker, revise, edit settings) and keeps one
scheduler to test.

## Decision

- A `custom` objective. `PlanInputs.picks` holds the deal ids. For a
  custom plan the candidates are exactly the picks; the preference filters
  (minimum bonus, hard pull, online, ChexSystems, business, bank
  exclusions, positive net value, one deal per bank) don't apply, because
  the user chose them. Hard blockers still do: ended, unreadable terms,
  not in your state, needs more parked cash than you have, needs a direct
  deposit with no paycheck, listed end date before the start.
- Ranking for custom: the ones ending soonest first, then the biggest
  deposits, so the hardest-to-place deals get the early paychecks.
- Paces still apply (Relaxed / Steady / Aggressive versions are shown).
  Every pick left out comes back in `Strategy.missed` with a reason in
  plain words, shown in the strategy modal.
- `PlanInputs.startOn` (null = today). `buildStrategy` plans from
  `max(today, startOn)`: paydays roll forward to it, nothing opens before
  it, and the plan length counts from it. Saved plans store it, so
  `endsOn` and "day X of Y" count from the start; before it, the tracker
  says "Starts <date>". Revising a plan that hasn't started re-plans from
  its start.
- Both go in permalinks (`only=`, `start=`); links and saved plans without
  them behave as before.

## Consequences

- Custom plans get sharing, tracking, revise and edit for free.
- A pick is the whole deal as parsed, top tier included. A deal whose top
  bonus needs a large balance (for example a checking + savings combo)
  is reported as "needs $X parked" rather than planned for its smaller
  checking-only tier. Picking a lower tier would need tier-level data
  from the parser.
- Suggested and custom plans share `PlanInputs`; the Plan form keeps your
  picks while you're on Suggested (they're only sent to the planner in
  Custom mode).
