import type { ModelId } from '../types';

// Rough per-worker memory (model weights + ONNX runtime + wasm heap), in MB
const WORKER_MB: Record<ModelId, number> = {
  'Xenova/whisper-tiny.en': 150,
  'Xenova/whisper-base.en': 250,
  'Xenova/whisper-small.en': 700,
};

const MAX_WORKERS = 8;

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
}

/**
 * How many parallel decoder workers the CPU (WASM) path should use. Each
 * worker holds its own copy of the model, so it's capped both by physical
 * cores (~ logical / 2; one single-threaded worker per core measured best)
 * and by a share of device memory. iOS Safari kills memory-hungry pages
 * aggressively, so it stays at one.
 */
export function decoderPoolSize(model: ModelId): number {
  if (isIOS()) return 1;
  const cores = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
  // navigator.deviceMemory is Chromium-only and capped at 8 (GB)
  const deviceGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const budgetMb = deviceGb ? deviceGb * 1024 * 0.25 : 1024;
  const byMemory = Math.floor(budgetMb / WORKER_MB[model]);
  return Math.max(1, Math.min(cores, byMemory, MAX_WORKERS));
}
