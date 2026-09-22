# CLAUDE.md — audio-transcriber

This file covers `apps/audio-transcriber` specifically. For the toolbox as
a whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

Client-side audio/video transcription: `ffmpeg.wasm` extracts audio,
`@huggingface/transformers` (Whisper, WebGPU with WASM fallback) transcribes
it to timestamped text. Migrated from its own standalone repo/deploy at
`audio-transcriber.vuongho.me` (being sunset) — see
[docs/progress/20260921.md](docs/progress/20260921.md) for the migration.

## Architecture notes

- Needs `Cross-Origin-Opener-Policy: same-origin` /
  `Cross-Origin-Embedder-Policy: credentialless` for ffmpeg.wasm/
  transformers.js's WebGPU/WASM backends — scoped to `/audio-transcriber/**`
  in the root `firebase.json`'s `hosting.headers`, not site-wide. See
  [ADR 0001](docs/adr/0001-audio-transcriber-coop-coep-headers.md).
- **`hosting.headers` rules can't be verified with local `firebase-tools
  serve`/`emulators:start` at all** — confirmed, not assumed (see the ADR's
  addendum). Any change to this tool's headers needs a real preview-channel
  deploy to verify; see the root `CLAUDE.md` for the exact commands.
- A dedicated Worker (`src/workers/transcription.worker.ts`) runs the whole
  extract→transcribe pipeline. Its ffmpeg-core base URL is derived from
  `import.meta.env.BASE_URL` (not hardcoded `/ffmpeg/`) since this tool is
  served under a subpath — a real bug found and fixed during migration, see
  the progress log above if touching this path again.

## Running

```bash
npm run dev:audio-transcriber    # from repo root
npm run build -w apps/audio-transcriber
```

## Docs

- `docs/adr/` — this tool's own decisions, numbered independently from the
  root and other apps' ADRs.
- `docs/progress/` — this tool's own build/bug-fix log, one file per
  calendar day it was worked on. Read the most recent one at the start of
  a session on this tool.
