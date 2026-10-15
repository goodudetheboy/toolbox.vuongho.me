# 0002. Planner: greedy over paydays, every pick validated by re-simulating the whole timeline

Status: Accepted

## Context

Given a biweekly paycheck, a plan length and constraints, produce schedules:
when to open which account, how to split each paycheck, when each bonus
should post and when it's safe to close. It must be deterministic (same
inputs → same plan), fast enough to recompute on every keystroke, and offer
several strategies to choose between rather than one "optimal" answer whose
optimality depends on preferences (money vs. effort vs. speed vs. number of
accounts).

An exact optimizer (ILP over deals × open dates × paycheck splits) would be
heavy to ship in the browser and opaque to reason about, and the input data
is itself approximate (parsed terms, assumed windows), so exactness buys
little.

## Decision

- Strategies = 4 objectives (most money, big ones only, least effort, money
  soonest) × 3 paces (1/2/3 new accounts per calendar month), identical
  plans collapsed. Each objective is just a candidate ranking.
- Opening slots are today and `leadDays` before each payday. At each slot,
  candidates are tried in rank order; a candidate is accepted only if:
  pace allows it, its bank isn't already in the plan, it can be opened
  before its end date, its requirements finish inside the plan, parked cash
  never exceeds "cash I can park", and **re-simulating every payday with it
  added still completes every chosen deal on time**.
- The simulation splits each paycheck earliest-deadline-first across at
  most `maxSplits` accounts; monthly requirements are 30-day buckets that
  each need their share; "N deposits" requirements keep each deposit at
  least need/N; the remainder goes to "your main account".
- Unknowns use `ASSUMED` defaults (90-day window, 90-day hold, payout ~60
  days, keep open 180 days) and are listed per item as "assumed".
- Strategy list sorts/filters (net, bonus, accounts, effort, first payout,
  cash parked; max accounts) are plain comparisons over the totals.

## Consequences

- Plans never silently overcommit a paycheck: an accepted deal can't break
  an earlier one. Tests assert the invariants rather than exact output.
- All 12 strategies compute in ~20–40 ms on the full deal list.
- Greedy isn't globally optimal (e.g. it won't delay a big deal to fit two
  smaller ones); the multiple objectives/paces are the hedge.
- Uses only each deal's top tier, and one deal per bank per plan.
