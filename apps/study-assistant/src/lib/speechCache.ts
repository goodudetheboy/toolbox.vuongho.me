import { api, type SpeakResponse } from './api';

// Read-aloud audio, kept so replaying a part doesn't call /speak again: in memory for this
// visit, and in Cache Storage across visits (keyed by a SHA-256 of the exact text, so an
// edited sentence is fetched fresh). Capped at MAX_ENTRIES, oldest dropped first; one piece
// is a few hundred KB of WAV.

const CACHE = 'study-assistant-speech';
const MAX_ENTRIES = 200;
const memory = new Map<string, Promise<SpeakResponse>>();

async function keyFor(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Cache Storage wants a URL; this one is never fetched.
  return `${location.origin}/study-assistant/__speech/${hex}`;
}

async function fromDisk(key: string): Promise<SpeakResponse | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(key);
    return hit ? ((await hit.json()) as SpeakResponse) : null;
  } catch {
    return null;
  }
}

async function toDisk(key: string, audio: SpeakResponse) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(key, new Response(JSON.stringify(audio), { headers: { 'Content-Type': 'application/json' } }));
    const keys = await cache.keys(); // insertion order
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).map((k) => cache.delete(k)));
  } catch {
    // no Cache Storage (private mode, old browser): the in-memory copy still helps
  }
}

/** The /speak audio for `text`, from cache when we've read it before. */
export function cachedSpeech(text: string): Promise<SpeakResponse> {
  let p = memory.get(text);
  if (!p) {
    p = (async () => {
      const key = await keyFor(text);
      const saved = await fromDisk(key);
      if (saved) return saved;
      const fresh = await api.speak(text);
      void toDisk(key, fresh);
      return fresh;
    })();
    p.catch(() => memory.delete(text)); // a failure can be retried next time
    memory.set(text, p);
  }
  return p;
}
