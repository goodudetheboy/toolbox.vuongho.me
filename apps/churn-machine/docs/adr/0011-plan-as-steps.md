# 0011. Plan is a few screens, one at a time

Status: Accepted

## Context

Plan showed everything on one page: the settings card (paycheck, schedule,
start, length, a Suggested / Custom switch, the deal picker, More options
with every filter) next to the strategy list. The user found it too much
at once and asked to be eased in: settings first, then Next, then choose
between suggested plans and building your own.

## Decision

Plan is a short flow, each screen at its own path so the browser's back
button and links work:

1. `/plan`: your paycheck (amount, pay schedule, start, length; More
   options: cash to park, splits, lead days, past-end-date deals). **Next**.
2. `/plan/how`: two tiles, "Suggest plans for me" or "Build my own", under a
   one-line summary of the settings with **Edit**.
3. `/plan/suggested`: the strategies, with the suggested-only filters (bank
   exclusions, minimum bonus, hard pull, online, ChexSystems, business)
   behind **Filters**; or `/plan/pick` → **Build my plan** → `/plan/custom`.

Step names are reserved path segments (`PLAN_STEPS` in `router.ts`);
anything else under `/plan/` is still a strategy permalink (ADR 0008), which
opens over the results screen it belongs to and closes back to it.
Settings stay in localStorage, so a returning user just clicks through.
The strategy list is only built on the results screens.

## Consequences

- Each screen asks one thing; filters only appear where they apply.
- Opening Plan always starts at the paycheck screen, so a returning user
  is two clicks from their strategies (settings prefilled). If that gets
  tedious, a "skip to my plans" shortcut can be added.
- The Suggested / Custom switch is gone; which kind you're looking at comes
  from the URL.

## Addendum (2026-10-16): lighter step 1, full settings on the results

At the user's request, step 1 asks only for what's needed to start:
paycheck, Paid, Start, Next payday (plan length defaults to 6 months). The
results screens (`/plan/suggested`, `/plan/custom`) bring back the full
settings card as a side panel: everything from step 1 plus Plan for and
"More options and filters" (custom: your deals instead of the filters).
On phones it folds into a one-line "Your settings" card that opens on tap.
So tweaking never means going back to step 1; the steps are only the way
in. The separate "Filters" disclosure on suggested results is gone.

## Addendum (2026-10-16): no settings summary on the in-between steps

The settings summary line ("$X paychecks semi-monthly · starts … · Edit")
was removed from step 2 and from Pick your deals at the user's request;
the "← back" link is the way to change step 1, and every setting is in the
panel on the results screens anyway.
