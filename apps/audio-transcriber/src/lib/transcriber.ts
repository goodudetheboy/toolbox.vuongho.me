// Transcription coordinator: extracts audio with ffmpeg.wasm, cuts it into
// overlapping windows, fans the windows out to a pool of decoder workers,
// retries failures, and merges finished windows in order — with the Whisper
// tokenizer for Whisper, by word timestamps for Parakeet. See
// docs/adr/0003-parallel-window-decoding.md and 0004-parakeet-model-option.md.
//
// Runs on the main thread on purpose: spawning the decoder pool from inside
// another worker (nested workers) failed outright in testing, and all the
// heavy lifting already happens off-thread (ffmpeg.wasm in its own worker,
// inference in the pool). Only windowing and the token merge run here.
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import type {
  ModelId,
  ComputeDevice,
  TranscriptSegment,
  WorkerInMessage,
  WorkerOutMessage,
  DecoderInMessage,
  DecoderOutMessage,
  TimedWord,
  WindowOutput,
} from '../types';
import { isParakeet, PARAKEET_WINDOW_S } from './models';

const SR = 16000;
// Whisper: same windowing as the pipeline's `chunk_length_s: 30,
// stride_length_s: 5` — 30s windows overlapping 5s on each side, so each new
// window adds 20s. Parakeet's window length is set in ./models (ADR 0004).
const WHISPER_WINDOWING = { window: 30 * SR, stride: 5 * SR };
const PARAKEET_WINDOWING = { window: PARAKEET_WINDOW_S * SR, stride: 5 * SR };
const MAX_ATTEMPTS = 3;
// Merging is O(windows so far), so don't re-merge on every single window
const EMIT_INTERVAL_MS = 1000;

const ffmpeg = new FFmpeg();

let post: (msg: WorkerOutMessage) => void = () => {};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── ffmpeg ──

async function ensureFFmpeg() {
  if (ffmpeg.loaded) return;
  const base = new URL(`${import.meta.env.BASE_URL}ffmpeg/`, location.origin).href;
  await ffmpeg.load({
    coreURL: `${base}ffmpeg-core.js`,
    wasmURL: `${base}ffmpeg-core.wasm`,
  });
}

async function extractAudio(file: File): Promise<Float32Array> {
  const mountDir = '/input';
  const inputPath = `${mountDir}/${file.name}`;
  const outputName = 'output.pcm';

  // Mount the File directly (WORKERFS) instead of writeFile-ing it into MEMFS:
  // writeFile copies the whole file into the wasm heap up front, which fails
  // for multi-GB files. WORKERFS reads it lazily off disk as ffmpeg needs it.
  await ffmpeg.createDir(mountDir);
  await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, mountDir);

  try {
    await ffmpeg.exec(['-i', inputPath, '-ar', '16000', '-ac', '1', '-f', 'f32le', outputName]);
  } finally {
    await ffmpeg.unmount(mountDir);
    await ffmpeg.deleteDir(mountDir);
  }

  const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
  await ffmpeg.deleteFile(outputName);

  return new Float32Array(data.buffer);
}

// ── Decoder pool ──

interface Job {
  onDone: (output: WindowOutput) => void;
  onFail: (error: string) => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
  jobId: number;
  alive: boolean;
}

interface Pool {
  key: string;
  model: ModelId;
  device: ComputeDevice;
  threads?: number;
  slots: Slot[];
  windowing: { window: number; stride: number };
  // Merges finished windows (a contiguous prefix, in order) into segments
  merge: (windows: Window[], outputs: WindowOutput[]) => TranscriptSegment[];
  // Called whenever a slot frees up or comes back to life
  onIdle: () => void;
}

let pool: Pool | null = null;
let nextJobId = 1;

function spawnDecoder(
  model: ModelId,
  device: ComputeDevice,
  threads: number | undefined,
  onProgress?: (progress: number, file: string) => void,
): Promise<{ slot: Slot; timePrecision: number }> {
  return new Promise((resolve, reject) => {
    // Literal URLs in each branch so Vite bundles both workers
    const worker = isParakeet(model)
      ? new Worker(new URL('../workers/parakeet.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('../workers/decoder.worker.ts', import.meta.url), { type: 'module' });
    const slot: Slot = { worker, job: null, jobId: 0, alive: false };

    worker.onmessage = (e: MessageEvent<DecoderOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'LOAD_PROGRESS') {
        onProgress?.(msg.progress, msg.file);
      } else if (msg.type === 'LOADED') {
        slot.alive = true;
        worker.onmessage = ev => handleDecoderMessage(slot, ev.data);
        worker.onerror = ev => handleDecoderCrash(slot, ev.message || 'Decoder worker crashed');
        resolve({ slot, timePrecision: msg.timePrecision });
      } else if (msg.type === 'LOAD_FAILED') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };
    worker.onerror = ev => {
      worker.terminate();
      reject(new Error(ev.message || 'Decoder worker failed to start'));
    };

    worker.postMessage({ type: 'LOAD', model, device, threads, reportProgress: !!onProgress } as DecoderInMessage);
  });
}

function handleDecoderMessage(slot: Slot, msg: DecoderOutMessage) {
  if ((msg.type !== 'DECODED' && msg.type !== 'DECODE_FAILED') || msg.jobId !== slot.jobId) return;
  const job = slot.job;
  slot.job = null;
  if (msg.type === 'DECODED') job?.onDone(msg.output);
  else job?.onFail(msg.error);
  pool?.onIdle();
}

// A worker that dies outright (e.g. wasm out-of-memory abort) is replaced,
// and whatever it was decoding goes back in the queue via onFail.
function handleDecoderCrash(slot: Slot, error: string) {
  slot.alive = false;
  slot.worker.terminate();
  const job = slot.job;
  slot.job = null;
  job?.onFail(error);

  const p = pool;
  if (!p || !p.slots.includes(slot)) return;
  spawnDecoder(p.model, p.device, p.threads)
    .then(({ slot: fresh }) => {
      if (pool !== p) { fresh.worker.terminate(); return; }
      p.slots[p.slots.indexOf(slot)] = fresh;
      p.onIdle();
    })
    .catch(() => {
      // Couldn't replace it; drop the slot. If none are left, the running
      // transcription fails once its queue runs dry (see runWindows).
      if (pool !== p) return;
      p.slots = p.slots.filter(s => s !== slot);
      p.onIdle();
    });
}

function destroyPool() {
  pool?.slots.forEach(s => s.worker.terminate());
  pool = null;
}

async function hasWebGPU(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function ensurePool(id: string, model: ModelId, device: ComputeDevice, maxWorkers: number): Promise<Pool> {
  const key = `${model}|${device}|${maxWorkers}`;
  if (pool?.key === key && pool.slots.length > 0) return pool;
  destroyPool();

  const onProgress = (progress: number, file: string) =>
    post({ type: 'MODEL_LOADING', id, progress, file });

  let effective: ComputeDevice = 'wasm';
  let threads: number | undefined;
  let first: { slot: Slot; timePrecision: number } | null = null;

  // Parakeet: always one worker; its encoder spreads over ORT's own threads
  // (on WebGPU those only run the small decoder) — see ADR 0004.
  const parakeetThreads = Math.min(navigator.hardwareConcurrency || 4, 8);

  // WebGPU: a single worker. Several workers would each hold a copy of the
  // model in GPU memory and haven't been measured to help — see ADR 0003.
  if (device === 'webgpu' && (await hasWebGPU())) {
    try {
      first = await spawnDecoder(model, 'webgpu', isParakeet(model) ? parakeetThreads : undefined, onProgress);
      effective = 'webgpu';
    } catch {
      first = null;
    }
  }

  const slots: Slot[] = [];
  if (first) {
    slots.push(first.slot);
  } else if (isParakeet(model)) {
    threads = parakeetThreads;
    first = await spawnDecoder(model, 'wasm', threads, onProgress);
    slots.push(first.slot);
  } else {
    // CPU: many single-threaded workers beat one multi-threaded one, because
    // the autoregressive decoder barely speeds up past ~2 threads.
    const n = Math.max(1, maxWorkers);
    threads = n > 1 ? 1 : undefined;
    // The first one downloads the model into the browser cache; the rest then
    // load from cache instead of all downloading it at once.
    first = await spawnDecoder(model, 'wasm', threads, onProgress);
    slots.push(first.slot);
    if (n > 1) {
      post({ type: 'PREPARING', id, label: `Starting ${n} workers…` });
      const rest = await Promise.allSettled(
        Array.from({ length: n - 1 }, () => spawnDecoder(model, 'wasm', threads)),
      );
      for (const r of rest) if (r.status === 'fulfilled') slots.push(r.value.slot);
    }
  }

  let windowing = PARAKEET_WINDOWING;
  let merge: Pool['merge'] = (windows, outputs) => mergeWords(windows, outputs as TimedWord[][]);
  if (!isParakeet(model)) {
    // Loaded lazily so transformers.js stays out of the initial page bundle
    const { AutoTokenizer, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const tokenizer = await AutoTokenizer.from_pretrained(model);
    const timePrecision = first.timePrecision;
    windowing = WHISPER_WINDOWING;
    merge = (windows, outputs) => mergeTokens(tokenizer, timePrecision, windows, outputs as bigint[][]);
  }

  pool = {
    key,
    model,
    device: effective,
    threads,
    slots,
    windowing,
    merge,
    onIdle: () => {},
  };
  post({ type: 'DEVICE_DETECTED', device: effective, workers: slots.length });
  return pool;
}

// ── Windowing + merge ──

interface Window {
  start: number;
  end: number;
  // [length, left stride, right stride] in samples, as the pipeline builds it
  stride: [number, number, number];
}

function makeWindows(length: number, { window, stride }: Pool['windowing']): Window[] {
  const windows: Window[] = [];
  if (length === 0) return windows;
  for (let offset = 0; ; offset += window - 2 * stride) {
    const end = Math.min(offset + window, length);
    const isFirst = offset === 0;
    const isLast = offset + window >= length;
    windows.push({ start: offset, end, stride: [end - offset, isFirst ? 0 : stride, isLast ? 0 : stride] });
    if (isLast) break;
  }
  return windows;
}

function mergeTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenizer: any,
  timePrecision: number,
  windows: Window[],
  tokens: bigint[][],
): TranscriptSegment[] {
  const chunks = tokens.map((t, i) => ({
    tokens: t.slice(),
    stride: windows[i].stride.map(x => x / SR),
  }));
  const [, optional] = tokenizer._decode_asr(chunks, {
    time_precision: timePrecision,
    return_timestamps: true,
    force_full_sequences: false,
  });
  return ((optional?.chunks ?? []) as { timestamp: [number, number | null]; text: string }[])
    .map(c => ({
      id: crypto.randomUUID(),
      start: c.timestamp[0],
      end: c.timestamp[1],
      text: c.text.trim(),
    }))
    .filter(s => s.text.length > 0);
}

// Parakeet: each window owns the span between its strides, so a word is kept
// from the window whose owned span contains the word's midpoint. Words are
// then grouped into sentence-like segments.
const SEGMENT_GAP_S = 1.5;
const SEGMENT_MAX_S = 20;

function mergeWords(windows: Window[], outputs: TimedWord[][]): TranscriptSegment[] {
  const words: TimedWord[] = [];
  outputs.forEach((ws, i) => {
    const w = windows[i];
    const offset = w.start / SR;
    const lo = (w.start + w.stride[1]) / SR;
    const hi = (w.end - w.stride[2]) / SR;
    const isLast = i === windows.length - 1;
    for (const word of ws) {
      const start = word.start + offset;
      const end = word.end + offset;
      const mid = (start + end) / 2;
      if (mid >= lo && (mid < hi || isLast)) words.push({ text: word.text, start, end });
    }
  });

  const segments: TranscriptSegment[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const text = current
      .map(w => w.text)
      .reduce((acc, t) => (!acc ? t : /^[,.;:!?)}\]]+$/.test(t) ? acc + t : `${acc} ${t}`), '')
      .trim();
    if (text) segments.push({ id: crypto.randomUUID(), start: current[0].start, end: current[current.length - 1].end, text });
    current = [];
  };
  for (const word of words) {
    const prev = current[current.length - 1];
    if (prev && (word.start - prev.end >= SEGMENT_GAP_S || word.end - current[0].start > SEGMENT_MAX_S)) flush();
    current.push(word);
    if (/[.!?]["')\]]*$/.test(word.text)) flush();
  }
  flush();
  return segments;
}

// Partial progress on the last failed file, so a retry only redoes the
// windows that are missing instead of re-extracting and re-decoding it all.
// Only valid for the same model: windowing and window outputs differ by model.
let resumable: { id: string; model: ModelId; audio: Float32Array; results: (WindowOutput | undefined)[] } | null = null;

function runWindows(
  p: Pool,
  id: string,
  audio: Float32Array,
  windows: Window[],
  results: (WindowOutput | undefined)[],
): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const total = windows.length;
    const queue = windows.map((_, i) => i).filter(i => !results[i]);
    const attempts = new Map<number, number>();
    let inFlight = 0;
    // First window that ran out of attempts. The other windows keep going so
    // a retry only has to redo the failed ones. (Text after a gap can't be
    // shown until the gap is filled — the merge needs contiguous windows.)
    let gaveUp: string | null = null;
    let settled = false;
    let merged = 0;
    let lastEmit = 0;

    const completed = () => results.filter(Boolean).length;

    const contiguous = () => {
      let n = 0;
      while (n < total && results[n]) n++;
      return n;
    };

    const report = (force = false) => {
      const prefix = contiguous();
      const now = performance.now();
      let segments: TranscriptSegment[] | undefined;
      if (prefix > merged && (force || now - lastEmit >= EMIT_INTERVAL_MS)) {
        segments = p.merge(windows.slice(0, prefix), results.slice(0, prefix) as WindowOutput[]);
        merged = prefix;
        lastEmit = now;
      }
      post({ type: 'PROGRESS', id, completed: completed(), total, segments });
    };

    const fail = (error: string) => {
      if (settled) return;
      settled = true;
      // Keep what's done so a retry only redoes the missing windows
      resumable = { id, model: p.model, audio, results };
      if (merged < contiguous()) report(true);
      reject(new Error(error));
    };

    const failIfDrained = () => {
      if (gaveUp && queue.length === 0 && inFlight === 0) fail(gaveUp);
    };

    const pump = () => {
      if (settled) return;
      const live = p.slots.filter(s => s.alive);
      if (live.length === 0 && p.slots.length === 0) {
        fail('All transcription workers failed to start');
        return;
      }
      for (const slot of live) {
        if (slot.job || queue.length === 0) continue;
        const i = queue.shift()!;
        const w = windows[i];
        const chunk = audio.slice(w.start, w.end);
        const jobId = nextJobId++;
        slot.jobId = jobId;
        inFlight++;
        slot.job = {
          onDone: output => {
            inFlight--;
            results[i] = output;
            if (settled) return;
            if (gaveUp) {
              report();
              failIfDrained();
            } else if (completed() === total) {
              settled = true;
              resumable = null;
              post({ type: 'PROGRESS', id, completed: total, total });
              resolve(p.merge(windows, results as WindowOutput[]));
            } else {
              report();
            }
          },
          onFail: error => {
            inFlight--;
            if (settled) return;
            const n = (attempts.get(i) ?? 0) + 1;
            attempts.set(i, n);
            if (n >= MAX_ATTEMPTS) {
              const at = new Date((w.start / SR) * 1000).toISOString().slice(11, 19);
              gaveUp ??= `Failed at ${at} after ${MAX_ATTEMPTS} attempts: ${error}`;
              failIfDrained();
            } else {
              queue.unshift(i);
            }
          },
        };
        slot.worker.postMessage({ type: 'DECODE', jobId, audio: chunk } as DecoderInMessage, [chunk.buffer]);
      }
    };

    p.onIdle = pump;
    report(true);
    if (queue.length === 0) {
      resolve(p.merge(windows, results as WindowOutput[]));
      return;
    }
    pump();
  });
}

// ── Entry ──

async function handle(msg: WorkerInMessage) {
  if (msg.type === 'DISCARD') {
    if (resumable?.id === msg.id) resumable = null;
    return;
  }

  const { id, file, model, device, maxWorkers } = msg;

  try {
    const p = await ensurePool(id, model, device, maxWorkers);

    let audio: Float32Array;
    let results: (WindowOutput | undefined)[];
    if (resumable?.id === id && resumable.model === model) {
      ({ audio, results } = resumable);
    } else {
      resumable = null;
      post({ type: 'EXTRACTING', id });
      await ensureFFmpeg();
      audio = await extractAudio(file);
      results = [];
    }

    const windows = makeWindows(audio.length, p.windowing);
    post({ type: 'TRANSCRIBING', id, completed: results.filter(Boolean).length, total: windows.length, workers: p.slots.length });

    const segments = await runWindows(p, id, audio, windows, results);
    post({ type: 'DONE', id, segments });
  } catch (err) {
    post({ type: 'ERROR', id, error: errorMessage(err) });
  }
}

export interface Transcriber {
  onmessage: ((msg: WorkerOutMessage) => void) | null;
  postMessage: (msg: WorkerInMessage) => void;
  terminate: () => void;
}

/**
 * Same message protocol as the old coordinator worker, so the UI talks to it
 * the way it would a Worker. Only one instance should be live at a time.
 */
export function createTranscriber(): Transcriber {
  let alive = true;
  const t: Transcriber = {
    onmessage: null,
    postMessage: msg => { void handle(msg); },
    terminate: () => {
      alive = false;
      destroyPool();
      resumable = null;
      post = () => {};
    },
  };
  // Deliver asynchronously, like a real worker, so callers never see a
  // re-entrant callback during postMessage.
  post = msg => queueMicrotask(() => { if (alive) t.onmessage?.(msg); });
  return t;
}
