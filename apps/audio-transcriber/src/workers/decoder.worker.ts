// One member of the decoder pool. Holds its own copy of the Whisper model and
// decodes one 30s window at a time into raw tokens; the coordinator merges
// windows. transformers.js serializes every inference call within a JS context
// (and runs ASR windows one by one), so parallelism has to come from several
// of these workers — see docs/adr/0003-parallel-window-decoding.md.
import { pipeline, env } from '@huggingface/transformers';
import type { DecoderInMessage, DecoderOutMessage } from '../types';

env.allowLocalModels = false;
env.useBrowserCache = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
let hopLength = 160;

function post(msg: DecoderOutMessage) {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<DecoderInMessage>) => {
  const msg = e.data;

  if (msg.type === 'LOAD') {
    try {
      // Must be set before the first session is created
      if (msg.threads && env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = msg.threads;
      asr = await pipeline('automatic-speech-recognition', msg.model, {
        device: msg.device,
        dtype:
          msg.device === 'webgpu'
            ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
            : { encoder_model: 'q8', decoder_model_merged: 'q8' },
        progress_callback: msg.reportProgress
          ? (info: Record<string, unknown>) => {
              if (info.status === 'progress' && typeof info.progress === 'number') {
                post({ type: 'LOAD_PROGRESS', progress: info.progress, file: String(info.file ?? '') });
              }
            }
          : undefined,
      });
      const fe = asr.processor.feature_extractor.config;
      hopLength = fe.hop_length;
      post({ type: 'LOADED', timePrecision: fe.chunk_length / asr.model.config.max_source_positions });
    } catch (err) {
      post({ type: 'LOAD_FAILED', error: (err as Error).message ?? String(err) });
    }
    return;
  }

  if (msg.type === 'DECODE') {
    try {
      // Same per-window steps as the ASR pipeline's own chunked path
      const { input_features } = await asr.processor(msg.audio);
      const output = await asr.model.generate({
        inputs: input_features,
        return_timestamps: true,
        num_frames: Math.floor(msg.audio.length / hopLength),
      });
      post({ type: 'DECODED', jobId: msg.jobId, tokens: output[0].tolist() });
    } catch (err) {
      post({ type: 'DECODE_FAILED', jobId: msg.jobId, error: (err as Error).message ?? String(err) });
    }
  }
};
