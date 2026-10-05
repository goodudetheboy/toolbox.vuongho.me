import { api } from './api';
import { MOCK } from './mock';

// Live speech-to-text while she recites: microphone PCM goes straight from the
// browser to Gemini Live (gemini-3.5-transcribe-live, verbatim mode, biased
// toward the note's own hard terms), authenticated with a single-use token the
// API mints — the real key never reaches the browser.

export interface LiveSession {
  /** Speech-to-text model in use (saved with session feedback). */
  model: string;
  sendAudio(base64Pcm: string): void;
  /** Flushes the recognizer and resolves with everything heard. */
  finish(): Promise<string>;
  close(): void;
}

export interface LiveOptions {
  vocabulary: string[];
  /** Everything heard so far (finalized text + the in-progress guess), on every update. */
  onHeard(text: string): void;
  onError(err: Error): void;
  /** Mock mode only: the words to "hear". */
  mockWords?: string[];
}

/** Joins transcript fragments, which may or may not carry their own leading space. */
function appendFragment(text: string, fragment: string): string {
  if (!fragment) return text;
  if (!text || /\s$/.test(text) || /^\s/.test(fragment)) return text + fragment;
  return `${text} ${fragment}`;
}

async function startRealLive(opts: LiveOptions): Promise<LiveSession> {
  const [{ GoogleGenAI }, grant] = await Promise.all([import('@google/genai'), api.liveToken(opts.vocabulary)]);
  const ai = new GoogleGenAI({ apiKey: grant.token, httpOptions: { apiVersion: 'v1alpha' } });

  let finalText = '';
  let interim = '';
  let lastMessageAt = Date.now();
  let closed = false;
  const emit = () => opts.onHeard(appendFragment(finalText, interim).trim());

  const session = await ai.live.connect({
    model: grant.model,
    // Must match the config locked into the token.
    config: grant.config,
    callbacks: {
      onmessage: (msg) => {
        lastMessageAt = Date.now();
        const content = msg.serverContent;
        if (!content) return;
        if (content.inputTranscription?.text !== undefined) {
          finalText = appendFragment(finalText, content.inputTranscription.text);
          interim = '';
          emit();
        } else if (content.interimInputTranscription?.text !== undefined) {
          interim = content.interimInputTranscription.text;
          emit();
        }
      },
      onerror: (e) => {
        if (!closed) opts.onError(new Error(e.message || 'Live connection error'));
      },
      onclose: (e) => {
        if (!closed && e.code !== 1000) opts.onError(new Error(e.reason || 'Live connection closed'));
      },
    },
  });

  const close = () => {
    if (closed) return;
    closed = true;
    session.close();
  };

  return {
    model: grant.model,
    sendAudio(data) {
      if (!closed) session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } });
    },
    async finish() {
      if (!closed) session.sendRealtimeInput({ audioStreamEnd: true });
      // Let the last words finalize: wait until the stream goes quiet (max ~2.5 s).
      const startedAt = Date.now();
      lastMessageAt = Date.now();
      while (Date.now() - lastMessageAt < 800 && Date.now() - startedAt < 2500) {
        await new Promise((r) => setTimeout(r, 100));
      }
      close();
      return appendFragment(finalText, interim).trim();
    },
    close,
  };
}

/** Dev-only fake: "says" ~60% of the words, goes quiet long enough for both hint levels, then most of the rest. */
function startMockLive(opts: LiveOptions): LiveSession {
  const words = opts.mockWords ?? [];
  const heard: string[] = [];
  const timers: number[] = [];
  const pause = Math.floor(words.length * 0.6);
  words.forEach((w, i) => {
    if (i % 7 === 6) return; // skip some words so the result has misses
    const at = 400 + i * 350 + (i >= pause ? 8000 : 0);
    timers.push(
      window.setTimeout(() => {
        heard.push(w);
        opts.onHeard(heard.join(' '));
      }, at),
    );
  });
  return {
    model: 'mock',
    sendAudio() {},
    async finish() {
      timers.forEach(clearTimeout);
      return heard.join(' ');
    },
    close() {
      timers.forEach(clearTimeout);
    },
  };
}

export function startLive(opts: LiveOptions): Promise<LiveSession> {
  return MOCK ? Promise.resolve(startMockLive(opts)) : startRealLive(opts);
}
