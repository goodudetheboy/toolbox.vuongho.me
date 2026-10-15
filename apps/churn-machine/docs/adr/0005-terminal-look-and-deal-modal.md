# 0005. Bloomberg-terminal look, deal modal and full deal page

Status: Look superseded by [0006](0006-robinhood-look.md) (the user disliked it); the modal,
full deal page still stand; "Banks I have" was reworked in [0007](0007-banks-i-have-in-accounts.md).

## Context

The first version used a calm light/dark look with deal rows that expanded
in place like an accordion. The user asked for a Bloomberg Terminal style
(font and colours), for a deal to open in a modal instead of expanding,
with a way to open that deal as a full page, and for bank names in a plan
to open the same modal. They also wanted to exclude banks they already have
by picking from a list rather than typing.

## Decision

- **Look:** black screen, amber (`#fb8b1e`) labels and command bar, white
  data, green/red for good/bad numbers, yellow for warnings, navy header
  bars, square edges, dense rows. Dark only; the light theme is gone. The
  real terminal font is proprietary, so the app bundles **IBM Plex Mono**
  (`@fontsource/ibm-plex-mono`, latin 400 + 600, precached as `woff2` so it
  works offline). All colours live in CSS variables in `src/styles.css`.
- **Deals list** is a table (bank, bonus, net, requirements, ends, grade);
  clicking a row opens `DealModal`. Its "Full page" button goes to
  `/churn-machine/deal/<id>` (`DealPage`, two-column panes, plus DoC's
  at-a-glance lines). The id is the DoC post slug, so links stay stable as
  long as DoC lists the deal; a missing id shows "not on the list anymore".
  The modal is plain state (no URL), closed by Esc, the backdrop, ✕, or any
  route change.
- **Plan:** bank names in both the by-account and by-paycheck views open the
  same modal. Strategy cards still expand in place (they are schedules, not
  deals).
- **Banks I have:** one list (`prefs.excludedBanks` in localStorage) chosen
  with `BankPicker`, a dropdown you can scroll or type into. It hides those
  banks on Deals and the planner skips them, on top of "Skip banks I already
  track". Matching uses `bankKey` (case and punctuation insensitive), now in
  `filters.ts`.

## Consequences

- Much denser: more deals fit on screen; small text is harder to read on a
  phone, so mobile collapses each row to three lines.
- No light mode any more. If that's wanted back it's a second set of the
  same CSS variables.
- The excluded-banks list is per device (localStorage), not synced through
  the signed-in account.
