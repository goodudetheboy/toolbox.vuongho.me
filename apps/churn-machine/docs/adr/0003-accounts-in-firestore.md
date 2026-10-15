# 0003. Your accounts and saved plans live in Firestore, owner-only

Status: Accepted

## Context

Browsing deals and planning are public and need no storage. Tracking which
accounts you actually have, which plan they belong to and where each one is
(opened, requirements done, bonus received, closed) must persist across
devices and needs sign-in.

## Decision

- Google sign-in (Firebase Auth, shared `vuonghome` project).
- Own named database `toolbox-churn-machine` (`us-central1`), per the
  toolbox-wide [ADR 0004](../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md).
- `users/{uid}/strategies/{id}`: name, paycheck, months, first payday,
  totals, archived.
- `users/{uid}/accounts/{id}`: bank, deal id + DoC link, bonus, status
  (`planned | open | met | paid | closed`), strategy id/name, the plan's
  dates and deposits (a snapshot, so the record survives the deal leaving
  DoC's list), what actually happened (opened/met/paid/closed dates, bonus
  received), notes.
- "Use this plan" writes the strategy and one `planned` account per item in
  one batch. Deleting a plan deletes its never-opened accounts and detaches
  the rest. "I opened this" on a deal creates an `open` account with
  estimated dates.
- Rules: a verified, signed-in user reads and writes only `users/{their
  uid}/…`. No allowlist: the data is personal and harmless to others.
- The planner skips banks you already track (not counting planned ones), on
  by default.

## Consequences

- No backend service; everything is client SDK + rules. Verified against
  the emulators (save → advance statuses → track → delete plan; other users
  and signed-out visitors denied).
- Plan snapshots don't update if DoC changes a deal later; the account
  links to the post for current terms.
