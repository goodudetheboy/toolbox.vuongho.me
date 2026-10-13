# 0004. Parakeet as an opt-in model

Status: Accepted (experimental)

## Context

The goal was faster transcription than Whisper. ADR 0003 found that
Whisper's autoregressive decoder is the bottleneck. NVIDIA Parakeet TDT
0.6B has a non-autoregressive decoder, and almost all of its work is in the
encoder (one big parallel pass). That should suit WebGPU well. It runs in
the browser through `parakeet.js` (MIT, ONNX Runtime Web). English-only v2
outputs punctuation, capitals and word timestamps.

Measured in headless Chromium (4 cores, WASM, no real GPU; the WebGPU
adapter there is SwiftShader without `shader-f16`). WER is computed after
lowercasing and stripping punctuation; numbers are in
`docs/progress/20261013.md`:

| Clip | Engine | × realtime | WER |
|---|---|---|---|
| 8.7 min LibriSpeech (read speech) | Whisper base, 2 workers | 5.8 | 10.1% |
| | Parakeet v2 int8, 4 threads, 30s windows | 5.5 | 3.4% |
| 29.3 min earnings call (6 speakers, phone audio) | Whisper base, 2 workers | 6.2 | 25.5% |
| | Parakeet, parakeet.js `transcribeLongAudio` (auto 90s windows) | 5.9 | 40.4% |
| | Parakeet, our 60s windows | 6.1 | 30.4% |
| | Parakeet, our 30s windows | 5.6 | 20.4% |

- On CPU, Parakeet is **not faster**. About 96% of its time is the
  encoder, so CPU speed comes down to raw int8 matmul throughput. It is
  clearly **more accurate**.
- Long windows dropped whole stretches of speech: 167 words in one gap
  with parakeet.js's 90s auto windows. 30s windows fixed most of it (64
  words in big gaps, vs 246 for Whisper, which has its own repetition
  loops).
- Its sentence-cursor stitching (`transcribeLongAudio`) is sequential. It
  can't be split across our pool, retried per window, or resumed.
- Download: int8 encoder 652 MB (CPU). WebGPU can't use the int8 encoder.
  parakeet.js would fall back to the fp32 one, which is 2.4 GB, so on GPU
  we use fp16 (1.24 GB), which needs `shader-f16`.

## Decision

- Add `parakeet-tdt-0.6b-v2` as an opt-in "Parakeet (experimental)"
  model. Whisper base stays the default.
- Reuse ADR 0003's coordinator: the same overlapping windows (30s, 5s
  strides), retries and resume. `src/workers/parakeet.worker.ts` speaks the
  same decoder protocol but returns timed words per window instead of
  tokens.
- Merge: a word is kept from the window whose owned span (between its
  strides) contains the word's midpoint. Words are grouped into segments at
  sentence-ending punctuation, gaps of 1.5s or more, or 20s of length.
- Pool: one worker. On CPU it gets `min(hardwareConcurrency, 8)` ORT
  threads, since the encoder parallelizes inside one session. A second
  model copy would cost another ~1.4 GB. On WebGPU the encoder runs on the
  GPU (fp16) and the small decoder on WASM threads.
- WebGPU is only attempted if the adapter has `shader-f16`. Otherwise
  load fails and the coordinator falls back to WASM int8, as it does for
  Whisper.
- Resuming a failed file only reuses finished windows if the model is the
  same, because the outputs aren't interchangeable.
- The Vite worker format is now `es`. parakeet.js code-splits (it imports
  onnxruntime-web dynamically), and IIFE worker bundles can't. Workers were
  already created with `{ type: 'module' }`.

## Consequences

- Fewer mistakes when opted in, at about the same CPU speed. Whether it's
  *faster* depends on WebGPU, which is **unmeasured**: no real GPU was
  available. Measure on a real GPU before making it the default or
  dropping "experimental".
- Big first download (660 MB CPU / 1.26 GB GPU), cached in IndexedDB
  (`parakeet-cache-db`) by parakeet.js, not the transformers.js Cache
  Storage.
- ONNX Runtime wasm binaries for parakeet.js's ORT 1.24 are bundled next
  to transformers.js's (~25 MB more deployed). They're fetched only when
  Parakeet is used.
- Memory: about 1.4 GB per worker estimated (not measured on phones).
  iOS gets the same single worker, which may still be too much.
- Not tried: Parakeet v3 (multilingual; same encoder size), several CPU
  workers with fewer threads each, or fp16 on WebGPU.
