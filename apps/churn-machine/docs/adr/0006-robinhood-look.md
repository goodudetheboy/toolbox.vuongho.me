# 0006. Robinhood look, purple on white

Status: Accepted (supersedes the look in 0005)

## Context

The Bloomberg Terminal look from ADR 0005 was rejected the same day ("so
ugly"). The user asked for the Robinhood app's style, in purple on white.

## Decision

- **Tokens** (all in `src/styles.css` `:root`): white page, ink `#111118`,
  one accent `#6f2cf3` (passes the dataviz validator against white), soft
  tints of it for selected states, red only for negative values. Light only.
- **Type:** Inter (`@fontsource-variable/inter`, one variable file; only the
  Latin subset is precached). Big, tight-tracked page titles and 48px hero
  numbers, like Robinhood's price display.
- **Patterns copied from Robinhood:**
  - list rows with the name and requirements on the left and a filled purple
    price pill on the right;
  - a "Top picks" row of scrolling cards (like Top Movers);
  - a deal page shaped like a stock page (hero number, "Key statistics" grid,
    hairline sections) with a sticky "order panel" card on the right;
  - the Plan inputs in that same right-hand panel as label/value rows;
  - pill buttons and chips;
  - a sticky blurred top bar on desktop, and a bottom tab bar with icons on
    phones;
  - the deal modal and the Deals filters as bottom sheets on phones;
  - a sticky action button on the phone deal page.
- **Plan chart** (`PayoutChart.tsx`): cumulative expected bonuses over time as
  a step line with a 10% area wash. Scrubbing (pointer or arrow keys) moves a
  crosshair and updates the big number above it, like a portfolio chart. List
  rows get a small sparkline of the same series. The schedule below is the
  table view. There are no axes beyond "Today" and the last date.

## Consequences

- The UI is airier, so fewer deals fit on screen than in the terminal look.
- The PWA theme colour, the manifest colours and the app icon are now
  white/purple.
- No dark mode. Adding one means a second set of the same variables, with
  the chart colour re-validated against the dark surface.
