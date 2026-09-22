# CLAUDE.md

Vuong's personal toolbox — `toolbox.vuongho.me`, a collection of small
independent tools. Homepage lists the tools; each tool links back to the
homepage.

## Repo map

- `apps/homepage/` — Vite + React + TS landing page listing tools
- `apps/<tool-name>/` — one independent app per tool (own deps/styling/
  stack; default is Vite + React + TS but nothing forces it — see
  `docs/adr/0001-monorepo-npm-workspaces.md`). Each tool also has its own
  `CLAUDE.md`, `docs/adr/`, and `docs/progress/` — see "Docs are split
  per-app" below. Current tools: `pdf-redactor`, `audio-transcriber`,
  `trip-planner`.
- `scripts/combine-dist.mjs` — merges every app's `dist/` into one root
  `dist/` before deploy (homepage at root, each tool under `/<tool-name>/`)
- `firebase.json` / `.firebaserc` — single Hosting site (`toolbox`) on the
  shared `vuonghome` GCP project
- `.github/workflows/deploy.yml` — CI/CD, deploys `dist/` to Firebase
  Hosting on push to `main`
- `docs/` — toolbox-wide only, see below

## Docs are split per-app — read the right `CLAUDE.md`/`docs/` for the job

If you're working inside `apps/<tool-name>/`, read that app's own
`CLAUDE.md` first — it has that tool's architecture notes and points at its
own `docs/adr/`/`docs/progress/`. This root `CLAUDE.md` and root `docs/`
cover only what's genuinely toolbox-wide: repo/monorepo structure, shared
GCP infrastructure, the build/deploy pipeline, or anything spanning more
than one app — plus light metadata about the tools as a whole (e.g. "tool X
was added, see its own docs"), never a tool's own implementation decisions
or day-to-day build log. See
[ADR 0005](docs/adr/0005-per-app-docs-and-claude-md.md) for the reasoning
and the full mapping of what moved where.

## Before changing anything architectural

Read `docs/adr/` first (and the relevant app's own `docs/adr/` if the
change is scoped to one tool). Each file is one decision with its
reasoning. If you're about to make a different choice than what's recorded
there, add a new ADR (or mark the old one superseded) — don't silently
deviate. A cross-reference from an app-level ADR to a root one (or vice
versa) is written out explicitly as "toolbox-wide" so it's clear when a
reference crosses that boundary.

## Progress logging — one file per day, not per session

`docs/progress/YYYYMMDD.md` — **one file per calendar day**, not one per
session or per chunk of work — at the root for toolbox-wide work, or inside
`apps/<tool-name>/docs/progress/` for work scoped to one tool. At the end
of a work session (or a meaningfully complete chunk), append a
`## HH:MM — title` section to **today's** file (root, app-level, or both if
the session touched both scopes) summarizing:
- What changed
- Decisions made (and whether they need a new/updated ADR)
- Open TODOs / what's blocked and on what

If today's file doesn't exist yet, create it. If it does, add a new `##`
section to it — don't create a second file for the same day. Only start a
new file when the calendar date changes. Edit a prior day's file only to
fix an error in it, not to add new entries — new entries always go in
today's file.

At the **start** of a session, read the most recent file in root
`docs/progress/` (sorted by filename) to see where things left off
toolbox-wide, and — if the session is working inside a specific app — that
app's own most recent `docs/progress/` file too.

## Running things

```bash
npm install                # once, at repo root
npm run dev:homepage       # start the homepage dev server
npm run dev:pdf-redactor   # start the PDF Redactor dev server
npm run dev:audio-transcriber
npm run dev:trip-planner
npm run build              # build every app (apps/*/dist)
npm run combine            # merge every app's dist/ into root dist/
```

GCP project: `vuonghome` (shared across all `*.vuongho.me` subdomains, see
`docs/adr/0002-shared-gcp-project-vuonghome.md`). Region for any per-tool
Cloud Run/Firestore resources: `us-central1`.

## Test the production build for anything Worker/module-loading-sensitive

`npm run dev` (Vite dev server, live unbundled ESM) and the actual
production bundle (single minified chunk) can genuinely behave
differently for Web Worker construction and module resolution — not just
theoretically, this shipped a real crash once in pdf-redactor (see
`apps/pdf-redactor/docs/adr/0005-export-real-parallelism-and-skip-passthrough.md`'s
addendum). Before pushing a change that touches `new Worker(...)`,
dynamic imports, or anything else sensitive to how modules get bundled,
verify it against the real build, not just dev mode:

```bash
npm run build && npm run combine && npx firebase-tools serve --only hosting --port 5055
```

then exercise the actual feature at `http://localhost:5055/<tool>/`.
Passing in dev mode is not sufficient evidence for these cases. This rule
is toolbox-wide (applies to any tool, not just the one that surfaced it),
which is why it lives here rather than in one app's own `CLAUDE.md`.

## `firebase.json` `hosting.headers` can't be verified locally at all

Neither `firebase-tools serve` nor `firebase-tools emulators:start` applies
`hosting.headers` rules — confirmed by testing a deliberately broad
`"source": "**"` rule that still never showed up on any local response (see
`apps/audio-transcriber/docs/adr/0001-audio-transcriber-coop-coep-headers.md`'s
addendum). Real deployed Hosting does apply them. If you add or change a
`headers` rule, verify it with a temporary preview channel instead:

```bash
npx firebase-tools hosting:channel:deploy <channel-name> --project vuonghome --expires 2h
# curl -sD - -o /dev/null https://<preview-url>/<path> | grep -i <header>
npx firebase-tools hosting:channel:delete <channel-name> --project vuonghome --site toolbox-vuonghome --force
```
