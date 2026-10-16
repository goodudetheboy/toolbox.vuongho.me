# 0012. Hand-checked deal terms: upfront vs later money

Status: Accepted (amends ADR 0001's "regex only, never guess"); amended by ADR 0013 (Gemini reads new or changed terms); ADR 0014 adds monthly fees

## Context

The regex parser (ADR 0001) reads a deal's headline bonus and its direct
deposit/balance fields, but it can't tell money you get for finishing the
sign-up requirements from money that needs a year or two of keeping
deposits going (Four Leaf: $350 for one $500 deposit, then $100 at 12
months and $100 at 24). It also attaches the wrong tier's requirement to
the top bonus (Citi $475 needs $5,000, not $3,000), and often takes the
title's amount over the post's terms. The user doesn't want long-haul
money counted: it isn't worth planning around.

Reading terms like this needs judgment (an LLM or a person). The user
chose a one-time pass, not AI parsing on every refresh: no API key, no
per-run cost, nothing that changes without a commit.

## Decision

- `data/deal-terms.json`: for every deal on the list as of 2026-10-16
  (247), read by hand once: `upfront` (what you get once the sign-up
  requirements are done, within the deal's initial window, at most about
  6 months; tiered deals keep the top tier), `how` (what earns it), the
  upfront requirement where the parser got it wrong (`dd`, `bal`, `tx`),
  and `later` (money that needs 12+ months, including long monthly drips
  like $25/month for 12 months).
- Each entry stores a hash of the deal's terms text (title, bonus text,
  requirements, DD and extra requirement text). `scripts/deal-terms.mjs`
  applies an entry only while the hash matches; a rewritten or new deal
  falls back to the parser and is marked `termsChecked: false`, and its
  page says the numbers are the automatic read.
- Applied in `refresh-deals.mjs` right after parsing, so `bonusMax`, `dd`,
  `balance` and `transactions` in `deals.json` are already the upfront
  ones and value, filters, sorting and the planner need no changes. The
  headline is kept as `bonusListed`, the later money as `later`.

## Consequences

- Net values and plans count only what's paid for the initial
  requirements. Three deals that only pay as long monthly drips now count
  $0 and drop out of plans; their pages explain why.
- The checked set ages: new deals and rewritten posts are unchecked until
  someone reads them and adds/updates entries (and their hash). The
  refresh log prints how many are unchecked.
- On 2026-10-16, 2 of the 247 posts had already changed between the read
  and the next refresh (both lost their terms block), so they're
  unchecked.

## Addendum (2026-10-16): extras

Entries also hold `extras`: requirements besides direct deposit and parked
cash (debit purchases with their window, eStatements, online banking, bill
pay, small minimum balances, monthly logins), read in the same pass for the
139 deals that have any. They're not dated tasks: the plan page pins them in
a "Don't forget" card for accounts marked opened (status `open`), each
tickable (`account.done["x:<hash of the text>"]`). The old dated
"Make N transactions" task is gone. Unchecked deals fall back to their
parsed transaction count.
