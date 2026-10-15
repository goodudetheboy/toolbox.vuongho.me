# 0008. Strategies open in a modal with a permalink built from their inputs

Status: Accepted

## Context

The user wanted a strategy to open in a modal instead of expanding in place,
and asked whether a strategy could have a permalink.

## Options

- **Save a snapshot to Firestore** and share its id. The link would be exact
  forever, but it needs public-read documents (a rules change and an abuse
  surface), a write on every share, and sign-in to share.
- **Put the inputs in the URL** and rebuild. The planner is deterministic
  (ADR 0002), so the inputs plus the strategy id (`<objective>-<pace>`) give
  back the same strategy. There's no backend, it works signed out, and
  nothing needs storing. The catch is that it's rebuilt from the current
  deals, so after a data refresh it can differ, or a deal in it may have
  ended.

## Decision

Inputs in the URL: `/churn-machine/plan/<strategyId>?pay=…&from=…&mo=…&cash=…
&split=…&lead=…&min=…&opt=hp.on.ch.bz.pd&st=NY&ex=Bank|Bank&apy=4&d=<deals date>`
(`src/lib/planLink.ts`).

- Clicking a strategy row pushes that URL and opens it in the shared `Sheet`.
  Browser back closes it, and the URL is the share link. A "Share link"
  button opens the share sheet on phones and copies the link elsewhere.
- The modal rebuilds the strategy from **the link's inputs**, not the
  viewer's form. If they differ, it offers "Use these settings in my plan",
  which copies everything except state and excluded banks into the form.
- `d` is the deals data date. If it isn't today's data, a notice says the
  plan was rebuilt and may differ. If the id isn't produced any more, the
  modal says so.
- A link opened after its first payday rolls forward in 2-week steps, the
  same as saved inputs.
- The link includes the excluded banks (your "Banks I have" plus extras), so
  the recipient sees the same plan. That reveals those bank names to whoever
  gets the link; the Share button's tooltip says so.
- Bank links inside the strategy modal open the deal modal stacked on top.
  `Sheet` closes only the top sheet on Esc.

## Consequences

- Links are long, but readable and editable.
- A shared plan is only reproducible while the deals behind it still exist.
  If exact sharing ever matters, a Firestore snapshot can be added later
  next to the URL form.
