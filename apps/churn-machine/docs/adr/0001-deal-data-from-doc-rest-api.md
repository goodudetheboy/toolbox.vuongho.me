# 0001. Deal data: Doctor of Credit via the WordPress REST API, parsed deterministically at build time

Status: Accepted

## Context

The tool needs every current bank bonus with structured fields (DD amount and
window, balance + hold, end date, fees, pull type…). Doctor of Credit's
"Best Bank Account Bonuses" page lists ~250 deals, each linking to a post
whose top has an "Offer at a glance" block plus "The Offer", "The Fine
Print" and "Our Verdict" sections, and dated update notes above it.

Options considered:

- **Scrape every post's HTML** — 265 requests per refresh. DoC's robots.txt
  asks for `Crawl-delay: 600`, so doing that daily is rude.
- **LLM extraction** (Gemini, cached by content hash) — better on free-form
  tiers, but needs a key in CI, can't be verified here, and isn't
  deterministic.
- **WordPress REST API + regex parsing** — `wp-json/wp/v2/posts?slug=a,b,…`
  returns full post HTML for up to 100 posts per request.

## Decision

- `scripts/refresh-deals.mjs` fetches the index post and the deals' posts in
  batches of 40 slugs through the REST API, ~3 s apart: about 8 requests per
  refresh, identified by a descriptive User-Agent.
- `scripts/parse-deals.mjs` parses deterministically (regex only). Rules
  worth knowing:
  - Struck-through text (`<del>`, `<s>`) is dropped, since DoC strikes
    superseded dates/amounts in place.
  - End date = latest of: the newest update note naming a date after a cue
    word ("extended to", "until", "through"), the glance field, and "(valid
    through …)" in the index blurb. If a newer "deal is back / no end date"
    note postdates that date, the date is treated as stale (no end date).
  - The index title's amount wins over the glance (the index is re-curated
    monthly); if the post never mentions that amount, `bonusPostMax` records
    the post's own top bonus and value/plan math uses it (conservative).
  - DD is always stored as a **total** within a window; per-month and
    "N deposits of $X each" are multiplied out. Amounts adjacent to
    "bonus" are never read as requirements.
  - A glance "DD: No" is overridden only when the offer flatly requires an
    amount of DD with no "or / one of the following / without" alternative.
  - Anything unreadable stays `null`; the UI shows "see post" and the
    planner either skips the deal (no glance block, unknown DD) or labels
    its defaults "assumed".
- `public/deals.json` is regenerated in CI before every build (and by the
  weekly scheduled deploy, daily until 2026-10-15; see the toolbox-wide
  [ADR 0007](../../../../docs/adr/0007-daily-scheduled-deploy.md)). A
  failed refresh warns and keeps the committed file, so DoC being down never
  blocks a deploy; the footer shows when the data was fetched.

## Consequences

- Refreshes are cheap and polite; data is at most a day old.
- Parsing is inspectable and unit-tested with real DoC snippets, but it will
  misread unusual wording. Every deal links to its post, the raw glance
  wording is shown next to parsed values, and the "assumed" labels keep
  guesses visible.
- Tiered offers are modeled at their top tier only (lower tiers are visible
  in "The offer" text, not used by the planner).
- If DoC changes the glance block format or disables the REST API, the
  refresh fails loudly (warning) and the app keeps serving the last good
  snapshot until the parser is updated.
