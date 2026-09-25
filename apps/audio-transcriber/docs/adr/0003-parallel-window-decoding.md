# 0003. Parallel window decoding with a worker pool

Status: Accepted

## Context

Transcription was slow. One worker ran the whole pipeline. It cut the audio
into hard 60s chunks and passed each one to the transformers.js ASR
pipeline (`chunk_length_s: 30, stride_length_s: 5`), one after another.
Measured in the browser (WASM backend, whisper-base.en q8, 4.6-min speech
clip; full numbers in `docs/progress/20260925.md`):

- The hard 60s cuts sliced words at every boundary: **6.0% WER**. Running
  the whole file through the pipeline's own overlapping windows gave
  **1.1%** at about the same speed.
- More ORT threads per session barely help past 2 (1 → 5.3×, 2 → 7.6×,
  16 → 7.8× realtime). The autoregressive decoder is the bottleneck.
- transformers.js serializes every inference call within a JS context
  (`webInferenceChain` in `backends/onnx.js`). Its ASR pipeline also
  decodes windows one by one, with no `batch_size`. Parallelism therefore
  has to come from several workers, each with its own model copy.
- Nested workers (a pool spawned from inside the old coordinator worker)
  failed outright in testing, even for a trivial script. Safari only added
  them in 15.5.

## Decision

- **The coordinator runs on the main thread** (`src/lib/transcriber.ts`).
  It keeps the same message protocol the old worker used. ffmpeg.wasm
  already runs in its own worker, and inference runs in the pool, so the
  main thread only cuts windows and merges tokens. Merging is throttled to
  about once a second.
- **Windows match the pipeline's own:** 30s windows with 5s strides on
  each side (20s steps) across the whole file. There are no pre-chunks.
- **A pool of decoder workers** (`src/workers/decoder.worker.ts`) each
  decode one window into raw tokens: the processor, then
  `model.generate({ return_timestamps, num_frames })`. The coordinator
  merges finished windows in order with `tokenizer._decode_asr`, the same
  call the pipeline makes. The output matches single-worker transcription
  (1.1% WER in both cases).
- **Pool size** (`src/lib/poolSize.ts`):
  - CPU: about one single-threaded worker per physical core
    (`hardwareConcurrency / 2`), capped by 25% of `deviceMemory` divided by
    a per-model estimate, and at 8.
  - iOS: always 1, because Safari kills memory-hungry pages.
  - WebGPU: 1 worker. Several would each hold the model in GPU memory, and
    that hasn't been measured.
  - The first worker downloads the model into the browser cache; the rest
    load it from cache.
- **Retries:** each window gets 3 attempts. A crashed worker is replaced
  and its window re-queued. If a window runs out of attempts, the other
  windows still finish, and then the file fails. The extracted audio and
  finished windows are kept in memory for that file (last failure only),
  so **Retry** redoes only the missing windows. Removing the file from the
  queue drops that state (`DISCARD`).

## Consequences

- CPU path: 8.5× → 15.3× realtime on an 8-core desktop, with 6.0% → 1.1%
  WER on the test clip. The gain should be larger on long files, since
  load imbalance matters less.
- Memory scales with pool size (one model copy per worker). The heuristic
  above is a guess, and it's untested on phones.
- Progress updates now replace the transcript wholesale (the merge is
  recomputed over all contiguous finished windows), instead of appending.
  Text after a failed window isn't shown until a retry fills the gap.
- transformers.js loads lazily on the main thread (tokenizer only), so the
  initial bundle doesn't include it.
- `_decode_asr` is an underscore-prefixed internal API. A transformers.js
  upgrade could change it, so re-check this path when upgrading.
- Unmeasured: WebGPU with several workers, and fp16 encoders. Revisit on a
  machine with a real GPU.
