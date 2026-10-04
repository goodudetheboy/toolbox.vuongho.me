# CLAUDE.md — study-assistant

This file covers `apps/study-assistant` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

"Study with Biggu": add a study note (paste, PDF/Word, photos) → Gemini
splits it word-for-word into Markdown parts → read a part → recite it aloud
while Gemini Live transcribes; pause ~3 s and Biggu (a brown-grey tabby
mascot) shows and speaks the next word → see the % remembered and what was
missed. Notes sync via Firestore. Only two allowlisted Google accounts.
Full design: [ADR 0001](docs/adr/0001-study-assistant-architecture.md).
One-time cloud setup (console clicks): [docs/SETUP.md](docs/SETUP.md).

## Layout

- `api/` — Cloud Run service `toolbox-study-assistant-api` (plain Node, its
  own `package.json`; **not** an npm workspace). Holds the Gemini key; all
  Gemini calls except the live mic stream. `npm test` inside `api/`.
- `src/lib/words.ts` — markdown → recitable words, accent-tolerant
  matching, "where is she up to", next-hint words. Unit-tested
  (`npm test -w apps/study-assistant`).
- `src/lib/useRecitation.ts` — talking-mode loop: mic, live transcript,
  on-device pause detection, hint prefetch/show/speak, scoring.
- `src/lib/mic.ts` (AudioWorklet → 16 kHz PCM), `live.ts` (Gemini Live with
  ephemeral token), `sound.ts` (plays hint audio), `api.ts`, `notes.ts`
  (Firestore), `importNote.ts` (files → /prepare input).
- `src/components/Biggu.tsx` — the mascot SVG, moods via props.
- `src/strings.ts` — all UI text (English).

## Running

```bash
npm run dev:study-assistant                       # real Firebase + API at localhost:8080
VITE_MOCK=1 npm run dev -w apps/study-assistant   # in-memory fakes, no sign-in/key needed
cd apps/study-assistant/api && GEMINI_API_KEY=… ALLOWED_EMAILS=you@x.com npm start
```

Model ids live in env vars on the Cloud Run service (`TEXT_MODEL`,
`LIVE_MODEL`, `TTS_MODEL`, `TTS_VOICE`); defaults in `api/index.js`.
Allowed emails live in two places that must match: `firestore.rules` and
`ALLOWED_EMAILS` in the root `.github/workflows/deploy.yml`.

## Docs

- `docs/adr/` — this tool's decisions. `docs/progress/` — its daily log.
