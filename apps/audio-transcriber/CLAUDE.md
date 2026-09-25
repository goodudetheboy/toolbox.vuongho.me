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
- Transcription: a main-thread coordinator (`src/lib/transcriber.ts`)
  extracts audio with ffmpeg.wasm, cuts overlapping 30s windows, and fans
  them out to a pool of decoder workers (`src/workers/decoder.worker.ts`).
  It retries failed windows and merges tokens in order with the Whisper
  tokenizer. No nested workers: they failed in testing. See
  [ADR 0003](docs/adr/0003-parallel-window-decoding.md). The ffmpeg-core
  base URL is derived from `import.meta.env.BASE_URL` (not hardcoded
  `/ffmpeg/`) since this tool is served under a subpath. That was a real
  bug found and fixed during migration; see the progress log above if
  touching this path again.
- Segment playback: history keeps only File System Access handles to the
  original recordings (`mediaHandles` store), never the media itself.
  Firefox/Safari fall back to re-attaching the file. See
  [ADR 0002](docs/adr/0002-recording-playback-via-file-handles.md).
- Icons are `lucide-react`. Don't use emojis for UI icons.

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
