# 0007. "Banks I have" lives in My accounts; Deals/Plan get a toggle

Status: Accepted (replaces the "Banks I have" part of 0005)

## Context

In ADR 0005, "Banks I have" was a single localStorage list picked on Deals
and Plan. The user wanted it to be part of My accounts. On Deals and Plan
they wanted a toggle to exclude those banks, plus a plain "Exclude banks"
option for anything else.

## Decision

- **Banks I have** is a section in My accounts, saved in Firestore at
  `users/{uid}/profile/main` (`banksIHave: string[]`), so it follows the
  Google sign-in across devices. The owner-only rule for `profile/{docId}`
  is in `firestore.rules`. The picker also accepts a typed name that isn't
  in today's deal data ("Add “…”"), so a bank that posts a deal later is
  still matched (by `bankKey`).
- The banks counted as "have" are that list **plus every tracked account
  that isn't just planned** (open, waiting, paid, closed). This replaces
  Plan's old "Skip banks I already track" checkbox.
- **Deals and Plan** share one `Exclusion` object built in `App.tsx`:
  - an **"Exclude banks I already have"** toggle (localStorage, on by
    default; disabled with a hint when signed out);
  - an **"Exclude banks"** picker for extra banks to hide (localStorage,
    works signed out). The existing `prefs.excludedBanks` became this list,
    so nobody loses what they picked.

  Both feed the same `excludeBanks` used by the deal filters and the planner.

## Consequences

- When signed out, only the "Exclude banks" picker does anything.
- The toggle's on/off state and the extra exclusions are still per device.
  Only "Banks I have" syncs.
