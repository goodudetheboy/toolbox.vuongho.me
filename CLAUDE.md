# CLAUDE.md

Vuong's personal toolbox — `toolbox.vuongho.me`, a collection of small
independent tools. Homepage lists the tools; each tool links back to the
homepage.

## Repo map

- `apps/homepage/` — Vite + React + TS landing page listing tools
- `apps/<tool-name>/` — one independent app per tool (own deps/styling/stack;
  default is Vite + React + TS but nothing forces it — see
  `docs/adr/0001-monorepo-npm-workspaces.md`)
  - `apps/audio-transcriber/` — client-side audio/video transcription
    (ffmpeg.wasm + transformers.js/Whisper), migrated from its own repo/
    deploy at `audio-transcriber.vuongho.me` (being sunset). Needs
    cross-origin isolation headers, scoped to its own path only — see
    `docs/adr/0012-audio-transcriber-coop-coep-headers.md`.
- `scripts/combine-dist.mjs` — merges every app's `dist/` into one root
  `dist/` before deploy (homepage at root, each tool under `/<tool-name>/`)
- `firebase.json` / `.firebaserc` — single Hosting site (`toolbox`) on the
  shared `vuonghome` GCP project
- `.github/workflows/deploy.yml` — CI/CD, deploys `dist/` to Firebase
  Hosting on push to `main`
- `docs/` — see below

## Before changing anything architectural

Read `docs/adr/` first. Each file is one decision with its reasoning. If
you're about to make a different choice than what's recorded there, add a
new ADR (or mark the old one superseded) — don't silently deviate.

## Progress logging — one file per day, not per session

`docs/progress/YYYYMMDD.md` — **one file per calendar day**, not one per
session or per chunk of work. At the end of a work session (or a
meaningfully complete chunk), append a `## HH:MM — title` section to
**today's** file summarizing:
- What changed
- Decisions made (and whether they need a new/updated ADR)
- Open TODOs / what's blocked and on what

If today's file doesn't exist yet, create it. If it does, add a new `##`
section to it — don't create a second file for the same day. Only start a
new file when the calendar date changes. Edit a prior day's file only to
fix an error in it, not to add new entries — new entries always go in
today's file.

At the **start** of a session, read the most recent file in
`docs/progress/` (sorted by filename) to see where things left off before
doing anything else.

## Running things

```bash
npm install                # once, at repo root
npm run dev:homepage       # start the homepage dev server
npm run dev:pdf-redactor   # start the PDF Redactor dev server
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
theoretically, this shipped a real crash once (see
`docs/adr/0009-export-real-parallelism-and-skip-passthrough.md`'s
addendum). Before pushing a change that touches `new Worker(...)`,
dynamic imports, or anything else sensitive to how modules get bundled,
verify it against the real build, not just dev mode:

```bash
npm run build && npm run combine && npx firebase-tools serve --only hosting --port 5055
```

then exercise the actual feature at `http://localhost:5055/<tool>/`.
Passing in dev mode is not sufficient evidence for these cases.

## `firebase.json` `hosting.headers` can't be verified locally at all

Neither `firebase-tools serve` nor `firebase-tools emulators:start` applies
`hosting.headers` rules — confirmed by testing a deliberately broad
`"source": "**"` rule that still never showed up on any local response (see
`docs/adr/0012-audio-transcriber-coop-coep-headers.md`'s addendum). Real
deployed Hosting does apply them. If you add or change a `headers` rule,
verify it with a temporary preview channel instead:

```bash
npx firebase-tools hosting:channel:deploy <channel-name> --project vuonghome --expires 2h
# curl -sD - -o /dev/null https://<preview-url>/<path> | grep -i <header>
npx firebase-tools hosting:channel:delete <channel-name> --project vuonghome --site toolbox-vuonghome --force
```
