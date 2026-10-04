// Microphone → 16 kHz mono 16-bit PCM (what Gemini Live expects), in ~100 ms
// base64 chunks, plus a loudness level for the on-device pause detector.
//
// The capture worklet is inlined as a Blob URL instead of a bundled file, so it
// loads identically in dev and in the production bundle (see the root CLAUDE.md
// on Worker/module-loading differences).

const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);
`;

const TARGET_RATE = 16000;
const SEND_EVERY_MS = 100;

export interface MicHandle {
  stop(): void;
  context: AudioContext;
}

export interface MicCallbacks {
  /** base64 little-endian Int16 PCM at 16 kHz. */
  onChunk(base64: string): void;
  /** RMS loudness of the latest audio, 0..1. */
  onLevel(rms: number): void;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Must be called from a tap/click (iOS only allows audio to start from a user gesture). */
export async function startMic(context: AudioContext, cb: MicCallbacks): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Echo cancellation keeps Biggu's spoken hints from being heard as her answer.
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'capture');
  // Keep the graph pulling without making any sound.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node).connect(mute).connect(context.destination);

  const ratio = context.sampleRate / TARGET_RATE;
  const perSend = Math.round((context.sampleRate * SEND_EVERY_MS) / 1000);
  let pending: Float32Array[] = [];
  let pendingLength = 0;

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const frame = e.data;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    cb.onLevel(Math.sqrt(sum / frame.length));

    pending.push(frame);
    pendingLength += frame.length;
    if (pendingLength < perSend) return;

    const all = new Float32Array(pendingLength);
    let o = 0;
    for (const f of pending) {
      all.set(f, o);
      o += f.length;
    }
    pending = [];
    pendingLength = 0;

    // Downsample by averaging each window of `ratio` input samples.
    const outLength = Math.floor(all.length / ratio);
    const pcm = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(all.length, Math.floor((i + 1) * ratio));
      let acc = 0;
      for (let j = start; j < end; j++) acc += all[j];
      const v = Math.max(-1, Math.min(1, acc / Math.max(1, end - start)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    cb.onChunk(toBase64(new Uint8Array(pcm.buffer)));
  };

  return {
    context,
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
