# 0014. Monthly fees: checked per deal and planned around

Status: Accepted (amends ADR 0012's deal terms and ADR 0002's planner)

## Context

Values and plans only counted a monthly fee when the parser read it as
unavoidable (8 deals). 57 more were "avoidable" and cost nothing, but
avoiding them takes something the plan didn't do: a balance kept for
months, a monthly direct deposit after the bonus is done, debit
purchases. The user asked for every deal's fee and waivers to be checked,
online too, and for the strategy engine to account for them.

## Decision

- `fee` in `data/deal-terms.json` for the 92 deals with a monthly fee, a
  one-time fee or a costless condition (eStatements...), read on 2026-10-16
  from each post's fee section and, for the national and larger regional
  banks, the bank's current terms online (several had changed: Wells Fargo
  $15, HSBC Premier $100k, Old National $500/15 purchases, Wells Fargo
  business $15/$2,000, free first months at Chase, U.S. Bank, Citi, BofA
  business...). Smaller credit unions come from the post. For tiered
  offers it's the account behind the counted (top) tier. Shape:
  `{ m, free, w: [["dd"|"bal", amount] | ["tx", count, how] | ["free", how]], once, note }`.
  Checked deals without an entry have no fee; the monthly Gemini check
  (ADR 0013) reads fees too, keeping only waiver amounts found in the post.
- `feePlans` (value.ts) lists every way to handle a deal's fee for as long
  as it stays open (keep-open time, or until the bonus posts if later),
  cheapest first: free and purchases cost $0, a monthly direct deposit $0
  (if it fits), a balance costs its interest at your savings APY, paying
  costs the fee. Free months, and months the bonus's own parked cash
  already covers, aren't charged. The cheapest is in the deal's value.
- Planner: each selection carries its fee plan. A balance waiver is a park
  span that counts against cash (if it doesn't fit, the next cheapest
  non-balance option is used). A direct deposit waiver adds monthly
  deposits in the paycheck simulation, after the bonus deposits, within
  the split limit, run past the plan's end until the account can close;
  months it can't cover are charged the fee. Revise reserves already-opened
  accounts' fee deposits.
- Saved accounts carry `fee`, `upkeep` (the deposits) and `feePark`; the
  tracker shows them as tasks that never trigger a revise (missing one costs
  a fee, not the bonus), and the free / purchase / pay ones in Don't forget.

## Consequences

- 45 deals' net values changed (most went down; a few went up where the
  parser had wrongly called a fee unavoidable). Some big business bonuses
  now carry real costs (Huntington $40 × 6 months, U.S. Bank $30 × 4).
- Fee deposits use paycheck splits, so with a low split limit a plan can
  pay some fees rather than fit every waiver.
- Fee data ages like the rest of the terms; bank fee schedules change more
  often than bonus terms.
