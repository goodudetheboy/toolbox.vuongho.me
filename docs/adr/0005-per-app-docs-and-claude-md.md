# 0005. Each app owns its own CLAUDE.md, ADRs, and progress log; root docs/ stays toolbox-wide only

Status: Accepted

## Context

Root `docs/adr/` and `docs/progress/` started as a single flat set for the
whole repo. That worked while there was one or two tools, but by the third
tool (`trip-planner`) most of the content in both folders was really about
one specific app's implementation (library choices, bug fixes, feature
build logs for `pdf-redactor`; a COOP/COEP header decision for
`audio-transcriber`) rather than anything toolbox-wide. A single root
`CLAUDE.md` was also starting to accumulate app-specific detail (e.g. the
audio-transcriber COOP/COEP callout in the repo map) that has nothing to do
with working on, say, `pdf-redactor`.

## Decision

- Each `apps/<tool-name>/` gets its own `CLAUDE.md`, `docs/adr/`, and
  `docs/progress/`, following the same conventions as the root ones (one
  ADR per decision, one progress file per calendar day), but scoped to that
  tool's own implementation only. Each app's ADRs are numbered independently
  starting at `0001`.
- Root `docs/adr/` and `docs/progress/` keep only toolbox-wide content:
  decisions or events that affect the repo/monorepo structure, shared GCP
  infrastructure, the build/deploy pipeline, or more than one app — plus
  light metadata about the tools as a whole (e.g. "tool X was added,
  see its own docs for details"), not that tool's actual implementation
  decisions or day-to-day build log.
- Root `CLAUDE.md` keeps general repo-wide guidance (repo map, running
  things, the production-build-testing rule, the `hosting.headers`
  verification gap) and points to each app's own `CLAUDE.md` rather than
  absorbing app-specific detail itself.
- Cross-references between an app-level ADR and a root-level one use a
  relative path back to `docs/adr/` (e.g.
  `../../../../docs/adr/0004-....md` from `apps/<tool>/docs/adr/`), called
  out explicitly as "toolbox-wide" in the linking text so it's clear the
  reference crosses that boundary.

Existing content was split along this line when this ADR was written:
former root ADRs 0004/0005/0007–0011 (all pdf-redactor-specific) moved to
`apps/pdf-redactor/docs/adr/`, renumbered 0001–0007; former 0012 moved to
`apps/audio-transcriber/docs/adr/0001`; former 0013 moved to
`apps/trip-planner/docs/adr/0001`. Former 0006 (per-tool backend/Firestore
naming) stayed at root, renumbered 0004, since it's a naming convention that
applies to every future tool, not a decision about one tool's own
implementation. Root progress logs for 2026-09-20/21/22 were similarly split:
each day's toolbox-wide events (scaffolding, CI/CD setup, a tool being added
to the homepage/launch config) stayed at root with a pointer to that day's
app-specific file for the implementation detail.

## Consequences

- Working on one tool no longer means reading through another tool's build
  history to find the toolbox-wide decisions mixed in with it, and vice
  versa.
- Slightly more bookkeeping: a change that's genuinely both (e.g. adding a
  tool at all) now typically touches two progress files — a short root
  entry plus the full detail in the app's own file — instead of one.
- A future tool starts with an empty `docs/adr/`, `docs/progress/`, and
  `CLAUDE.md` of its own from day one, rather than commingling with root
  from the start and needing a split like this one later.
