import type { ModelId, ParakeetModelId } from '../types';

export function isParakeet(model: ModelId): model is ParakeetModelId {
  return model.startsWith('parakeet-');
}

// Parakeet window length in seconds (5s overlap each side, as for Whisper).
// Its encoder isn't limited to 30s, but parakeet.js's 90s auto windows
// dropped stretches of speech on a 29-min call — see ADR 0004.
export const PARAKEET_WINDOW_S = 30;
