import { pipeline, env } from '@huggingface/transformers';
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import type { ModelId, ComputeDevice, TranscriptSegment, WorkerInMessage, WorkerOutMessage } from '../types';

env.allowLocalModels = false;
env.useBrowserCache = true;

const ffmpeg = new FFmpeg();
let currentModel: ModelId | null = null;
let currentDevice: ComputeDevice | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: ((audio: Float32Array, opts: Record<string, unknown>) => Promise<any>) | null = null;

function post(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

async function ensureFFmpeg() {
  if (ffmpeg.loaded) return;
  const base = new URL(`${import.meta.env.BASE_URL}ffmpeg/`, self.location.origin).href;
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

async function ensurePipeline(id: string, model: ModelId, device: ComputeDevice) {
  if (transcriber && currentModel === model && currentDevice === device) return;

  transcriber = null;
  currentModel = null;
  currentDevice = null;

  let effectiveDevice = device;

  const load = async (dev: ComputeDevice) =>
    pipeline('automatic-speech-recognition', model, {
      device: dev,
      dtype:
        dev === 'webgpu'
          ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
          : { encoder_model: 'q8', decoder_model_merged: 'q8' },
      progress_callback: (info: Record<string, unknown>) => {
        if (info.status === 'progress' && typeof info.progress === 'number') {
          post({ type: 'MODEL_LOADING', id, progress: info.progress, file: String(info.file ?? '') });
        }
      },
    });

  try {
    if (device === 'webgpu' && !('gpu' in navigator)) throw new Error('No WebGPU');
    transcriber = await load('webgpu');
    effectiveDevice = 'webgpu';
  } catch {
    transcriber = await load('wasm');
    effectiveDevice = 'wasm';
  }

  post({ type: 'DEVICE_DETECTED', device: effectiveDevice });
  currentModel = model;
  currentDevice = effectiveDevice;
}

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  if (e.data.type !== 'TRANSCRIBE') return;
  const { id, file, model, device } = e.data;

  try {
    await ensurePipeline(id, model, device);

    post({ type: 'EXTRACTING', id });
    await ensureFFmpeg();
    const audio = await extractAudio(file);

    const CHUNK_SAMPLES = 1 * 60 * 16000; // 1 min @ 16 kHz
    const totalChunks = Math.ceil(audio.length / CHUNK_SAMPLES);

    post({ type: 'TRANSCRIBING', id, totalChunks });

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SAMPLES;
      const chunk = audio.slice(start, start + CHUNK_SAMPLES);
      const timeOffset = (start / 16000);

      const result = await transcriber!(chunk, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const segments: TranscriptSegment[] = (result.chunks ?? [])
        .map((c: { timestamp: [number, number | null]; text: string }) => ({
          id: crypto.randomUUID(),
          start: c.timestamp[0] + timeOffset,
          end: c.timestamp[1] !== null ? c.timestamp[1] + timeOffset : null,
          text: c.text.trim(),
        }))
        .filter((s: TranscriptSegment) => s.text.length > 0);

      post({ type: 'CHUNK_DONE', id, segments, chunkIndex: i, totalChunks });
    }

    post({ type: 'DONE', id });
  } catch (err) {
    post({ type: 'ERROR', id, error: (err as Error).message ?? String(err) });
  }
};
