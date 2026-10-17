# 0016. ChexSystems: per-bank limits, sensitive banks first

Status: Accepted (amends ADR 0002's planner and ADR 0013's Gemini check)

## Context

Plans ignored how many accounts they open. Banks check ChexSystems (and the
big ones Early Warning Services); many new accounts look like fraud and
some banks deny. Doctor of Credit's guidance is that about 10 a year is
generally fine and trouble starts around 12+, with per-bank reports ranging
from "2 in a month" (Flagstar) to "30+ in 3 years" (PNC). Steady and
Aggressive plans opened 13-17 accounts a year, and the sensitive banks in
them were scheduled late (4th-14th account), when you'd have the most
recent inquiries. Only 23 deals were flagged sensitive (from their own
post). The user asked for these three changes, a brief guide section that
links out ("we don't really specialize in that"), and a Gemini web check.

## Decision

- `data/chex.json`, per bank (`bankKey`): `s` (sensitive / not / unknown),
  `lim` ([[accounts, months]] reported denials; smallest numbers reported),
  `note`, `ews`. Made by hand on 2026-10-17 from Doctor of Credit's
  inquiry-sensitive list and its EWS list for the banks we have deals for
  (67 entries). `scripts/chex.mjs` applies it to deals as `chex` and sets
  `chexSensitive` when either the post or the list says so.
- Banks with no hand entry are filled in by Gemini, in the same monthly run
  as ADR 0013 (`scripts/chex.mjs`), in two steps:
  1. Doctor of Credit's two lists (inquiry-sensitive banks, banks that pull
     EWS) are fetched through its WordPress API and read by `MODEL` in one
     call (about a minute for ~150 banks) that matches our banks to them,
     only when a list's `modified_gmt` changed (`_lists` in chex.json). A
     match under a different name is noted ("Listed as ...") so a wrong one
     is easy to spot.
  2. Banks still unknown are looked up on the web: a quick pass (`MODEL`,
     low thinking, Google Search grounding) finds and quotes reports, then a
     careful pass (`MODEL`, normal thinking, no search) decides from the
     quotes only. About 15 s a bank, 5 at a time, at most 30 a run,
     re-checked after 180 days. The first version was one grounded call per
     bank with normal thinking: right, but 30-60 s each (the first full run
     was still going after 25 minutes). Low thinking alone was fast but
     answered wrong (Flagstar "not sensitive"); flash-lite as the searcher
     found nothing. The user suggested splitting search and reading.
  Entries are saved with `by: "gemini"`, `from` ("doc-list" or "web"), the
  date and cited sites; a lookup that didn't search is stored as unknown,
  limits outside 1-60 accounts / 1-36 months are dropped, hand entries are
  never overwritten. The prompt goes in the user turn: with search on, a
  system instruction often got an empty answer. CI commits `chex.json` with
  `deal-terms.json`.
- Planner: no overall cap (a first version had "most new accounts a year",
  default 10; the user rejected a flat limit since banks differ). Each bank's
  limits come from `chexLimits`: its reported `lim`, or [[12, 12]] (DoC's
  general "trouble around 12 a year") when it's sensitive with no numbers;
  banks reported not to mind, or unknown, have none. Every selected bank must
  have fewer than n openings in the m×30 days up to its own opening, counting
  `recentOpens` (accounts marked opened in My Bag in the last year; Revise
  counts those outside the plan). A third greedy variant moves the picked
  sensitive banks to the front, kept unless it nets less. `totals.perYear`
  (most openings in any 12 months) is shown on a strategy for information.
- Deal page: the post's line plus what's reported (limits, EWS, AI note).

## Consequences

Plans keep their size where banks don't mind, and sensitive banks come
first and within their reported limits. The numbers are crowdsourced reports, not bank rules, which the UI
says. The Gemini check can be wrong; its entries are labelled. Banks whose
name differs between DoC's list and our deals (e.g. "Orion Bank" vs
"Orion Financial") were left to Gemini rather than guessed.
