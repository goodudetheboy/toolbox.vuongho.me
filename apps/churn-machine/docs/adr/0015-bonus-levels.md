# 0015. Bonus levels: every tier checked, the best one counted

Status: Accepted (amends ADR 0012's deal terms and ADR 0002's planner)

## Context

Values and plans counted every deal at its top tier only (ADR 0012's
`upfront`). 45 checked deals have more than one level: deposit tiers
(e*Trade $400 for $20k or $800 for $100k), product tiers (Old National
Everyday vs Preferred) or combos (TD checking $300 plus savings $200).
Counting only the top made several deals look negative (e*Trade −$22,
HSBC −$788, PNC business −$136) when a lower level nets $185–$375, and
made plans drop deals entirely when your cash couldn't cover the top
level's balance. The user asked for this to be fixed after a vet of every
deal turned it up.

## Decision

- `tiers` in a `data/deal-terms.json` entry: the lower levels, each
  `{ upfront, how, dd, bal, tx, extras, fee }` with the entry's own
  meanings, anything left out the same as the top level's. Read from each
  post on 2026-10-16/17. Where a lower level is a different account, its
  monthly fee was checked online when it could be (PNC Performance Spend
  and Basic Business, Huntington Unlimited Business, TD Complete, BOK and
  Bank of Texas Access, Bank of Hawaii Convenience, ONB Everyday, U.S. Bank
  Silver); otherwise it inherits the top level's fee (conservative).
  `applyTerms` writes `deal.tiers` (top first, fully resolved) and
  `bonusMin` as the lowest level; checked deals without tiers now have
  `bonusMin = upfront` (no more parser "up to" ranges from old offers).
- `levelsOf(d)` (value.ts) turns a deal into one Deal per level (`tier`
  set, bonus/requirements/fee swapped in), so value, fee plans, the
  planner, requirement lines and the deal page work on a level unchanged.
  `bestLevel` picks the highest net (ties: bigger bonus) among the levels a
  predicate allows.
- Deals list: the best level that passes the filters. Deal page: that
  level (or the plan's, when opened from a strategy), plus a Bonus levels
  section listing all of them.
- Planner: each level is a candidate; one per deal. The greedy runs two
  passes (each deal at its first-ranked level, then other levels for deals
  still out), so a lower level doesn't grab a deal whose top level only
  had to wait a paycheck. Unless the goal is speed, it also plans with top
  levels only and keeps whichever nets more: over 240 real-data plans (5
  states × 4 cash amounts) levels came out better in 120 and worse in 1
  (by $7), excluding Money soonest, which takes faster lower levels by design.
- Saved accounts store `tier`; the tracker and Revise read that level.
- Gemini-read entries (ADR 0013) don't get tiers yet: those deals count at
  the level Gemini reports.

## Consequences

Numbers are higher and more honest for tiered deals, and low-cash plans
can include them. Lower levels with an unchecked product fee may be a
little pessimistic. Planning does up to twice the greedy work for
non-speed goals (still about a second for all strategies). A rewritten
post drops its tiers along with the rest of its checked terms (hash
mismatch), as before.
