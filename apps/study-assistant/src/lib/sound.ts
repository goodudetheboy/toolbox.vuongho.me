// Plays Biggu's spoken hints (Gemini TTS output) through the shared AudioContext.

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decodes WAV (the TTS default) or raw 16-bit PCM ("audio/l16; rate=24000"). */
export async function decodeSpeech(ctx: AudioContext, data: string, mimeType: string): Promise<AudioBuffer> {
  const bytes = base64ToBytes(data);
  if (/l16|pcm/i.test(mimeType)) {
    const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] || 24000);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = ctx.createBuffer(1, samples.length, rate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 0x8000;
    return buffer;
  }
  return ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/** Plays a buffer; resolves when it finishes. */
export function play(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => resolve();
    src.start();
  });
}
