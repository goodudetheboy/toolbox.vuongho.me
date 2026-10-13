// Parakeet member of the decoder pool: same protocol as decoder.worker.ts, but
// returns timed words per window instead of Whisper tokens. Parakeet's cost is
// almost all in its (non-autoregressive) encoder, which ORT parallelizes across
// threads itself, so the pool runs a single multi-threaded worker of these —
// see docs/adr/0004-parakeet-model-option.md.
import { fromHub } from 'parakeet.js';
import type { DecoderInMessage, DecoderOutMessage, TimedWord } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;

function post(msg: DecoderOutMessage) {
  self.postMessage(msg);
}

async function hasF16(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator as any).gpu?.requestAdapter();
    return !!adapter?.features.has('shader-f16');
  } catch {
    return false;
  }
}

self.onmessage = async (e: MessageEvent<DecoderInMessage>) => {
  const msg = e.data;

  if (msg.type === 'LOAD') {
    try {
      // WebGPU needs the fp16 encoder (~1.2 GB); parakeet.js can't run the
      // int8 one there and would otherwise pull the 2.4 GB fp32 one instead.
      if (msg.device === 'webgpu' && !(await hasF16())) throw new Error('WebGPU without shader-f16');
      model = await fromHub(msg.model, {
        backend: msg.device,
        encoderQuant: msg.device === 'webgpu' ? 'fp16' : 'int8',
        decoderQuant: 'int8',
        cpuThreads: msg.threads,
        progress: msg.reportProgress
          ? ({ loaded, total, file }: { loaded: number; total: number; file: string }) => {
              if (total > 0) post({ type: 'LOAD_PROGRESS', progress: (loaded / total) * 100, file });
            }
          : undefined,
      });
      post({ type: 'LOADED', timePrecision: 0 });
    } catch (err) {
      post({ type: 'LOAD_FAILED', error: (err as Error).message ?? String(err) });
    }
    return;
  }

  if (msg.type === 'DECODE') {
    try {
      const r = await model.transcribe(msg.audio, 16000, { returnTimestamps: true, enableProfiling: false });
      const words: TimedWord[] = (r.words as { text: string; start_time: number; end_time: number }[])
        .map(w => ({ text: w.text, start: w.start_time, end: w.end_time }));
      post({ type: 'DECODED', jobId: msg.jobId, output: words });
    } catch (err) {
      post({ type: 'DECODE_FAILED', jobId: msg.jobId, error: (err as Error).message ?? String(err) });
    }
  }
};
