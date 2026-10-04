import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { startLive, type LiveSession } from './live';
import { startMic, type MicHandle } from './mic';
import { decodeSpeech, play } from './sound';
import { align, nextHint, type Token } from './words';

// The talking-mode loop: microphone → Gemini Live transcript → on-device word
// tracking. Pauses are detected on the device (not by Gemini) so the hint fires
// on time: after PREFETCH_MS of quiet the hint audio is fetched in the
// background, after HINT_MS it's shown and spoken. First hint is the next word;
// if she's still stuck, the next three. Hinted words never count as remembered.

const PREFETCH_MS = 1500;
const HINT_MS = 3000;
const TICK_MS = 200;

export type Phase = 'idle' | 'connecting' | 'listening' | 'scoring' | 'result';
export type WordStatus = 'said' | 'close' | 'hinted' | 'missed';

export interface Hint {
  indices: number[];
  text: string;
}

export interface Result {
  statuses: WordStatus[];
  percent: number;
}

function cleanForSpeech(words: string[]): string {
  return words.join(' ').replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
}

export function useRecitation(tokens: Token[], vocabulary: string[]) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [hint, setHint] = useState<Hint | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<'mic' | 'other' | null>(null);

  const alignment = useMemo(() => align(tokens, heard), [tokens, heard]);

  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  const lastActivity = useRef(0);
  const hintLevel = useRef(0);
  const hinted = useRef(new Set<number>());
  const speechCache = useRef(new Map<string, Promise<AudioBuffer | null>>());
  const noiseFloor = useRef(0.01);
  const alignmentRef = useRef(alignment);
  alignmentRef.current = alignment;

  const teardown = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    liveRef.current?.close();
    liveRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // Any new recognized speech counts as activity, and once she says past the hint, it clears.
  useEffect(() => {
    if (phase !== 'listening') return;
    lastActivity.current = Date.now();
    if (hint && hint.indices.some((i) => alignment.said.has(i) || i < alignment.cursor)) {
      setHint(null);
      hintLevel.current = 0;
    }
  }, [heard]); // eslint-disable-line react-hooks/exhaustive-deps

  const speech = useCallback((text: string) => {
    let p = speechCache.current.get(text);
    if (!p) {
      p = api
        .speak(text)
        .then((r) => (ctxRef.current ? decodeSpeech(ctxRef.current, r.data, r.mimeType) : null))
        .catch(() => null);
      speechCache.current.set(text, p);
    }
    return p;
  }, []);

  // Pause detector + hint scheduler.
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = window.setInterval(async () => {
      if (hintLevel.current >= 2) return; // both hints given; wait for her to speak again
      const quiet = Date.now() - lastActivity.current;
      if (quiet < PREFETCH_MS) return;
      const indices = nextHint(tokens, alignmentRef.current, hintLevel.current === 0 ? 1 : 3);
      if (indices.length === 0) return;
      const text = cleanForSpeech(indices.map((i) => tokens[i].display));
      if (!text) return;
      const audio = speech(text);
      if (quiet < HINT_MS) return;

      hintLevel.current += 1;
      indices.forEach((i) => hinted.current.add(i));
      setHint({ indices, text });
      // Don't count the hint's own playback as quiet time.
      lastActivity.current = Date.now() + 10_000;
      const buffer = await audio;
      if (buffer && ctxRef.current) await play(ctxRef.current, buffer);
      lastActivity.current = Date.now();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase, tokens, speech]);

  const start = useCallback(async () => {
    setError(null);
    setHeard('');
    setHint(null);
    setResult(null);
    hinted.current = new Set();
    hintLevel.current = 0;
    setPhase('connecting');
    try {
      // Created inside the tap so iOS lets it play Biggu's voice later.
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();

      const live = await startLive({
        vocabulary,
        mockWords: tokens.map((tk) => tk.display),
        onHeard: setHeard,
        onError: () => {
          teardown();
          setError('other');
          setPhase('idle');
        },
      });
      liveRef.current = live;

      micRef.current = await startMic(ctx, {
        onChunk: (b64) => live.sendAudio(b64),
        onLevel: (rms) => {
          // Noise floor drops instantly to quieter levels and creeps up to steady ones over a
          // few seconds, so a fan/TV hum is absorbed while bursts of speech stay above it.
          noiseFloor.current = rms < noiseFloor.current ? rms : noiseFloor.current * 0.999 + rms * 0.001;
          if (rms > Math.max(0.02, noiseFloor.current * 3)) lastActivity.current = Math.max(lastActivity.current, Date.now());
        },
      });

      try {
        wakeRef.current = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        // keeping the screen on is just a nicety
      }
      lastActivity.current = Date.now();
      setPhase('listening');
    } catch (err) {
      teardown();
      const name = (err as { name?: string }).name;
      setError(name === 'NotAllowedError' || name === 'NotFoundError' ? 'mic' : 'other');
      setPhase('idle');
    }
  }, [tokens, vocabulary, teardown]);

  /** Stops listening, scores what she said, returns the percentage (or null on failure). */
  const stop = useCallback(async (): Promise<number | null> => {
    const live = liveRef.current;
    micRef.current?.stop();
    micRef.current = null;
    setHint(null);
    setPhase('scoring');
    const transcript = live ? await live.finish() : heard;
    teardown();

    const local = align(tokens, transcript);
    let said = local.said;
    let close = new Set<number>();
    try {
      const scored = await api.score(
        tokens.map((tk) => tk.display),
        transcript,
      );
      // Gemini judges meaning-level matches (accent, reordering); keep anything either side credited.
      said = new Set([...scored.said, ...local.said]);
      close = new Set(scored.close);
    } catch {
      // Fall back to the on-device match.
    }

    const statuses: WordStatus[] = tokens.map((_, i) =>
      hinted.current.has(i) ? 'hinted' : close.has(i) ? 'close' : said.has(i) ? 'said' : 'missed',
    );
    const remembered = statuses.filter((s) => s === 'said' || s === 'close').length;
    const percent = tokens.length ? Math.round((100 * remembered) / tokens.length) : 0;
    setResult({ statuses, percent });
    setPhase('result');
    return percent;
  }, [heard, tokens, teardown]);

  const reset = useCallback(() => {
    teardown();
    setPhase('idle');
    setHeard('');
    setHint(null);
    setResult(null);
    setError(null);
  }, [teardown]);

  const progress = tokens.length ? alignment.said.size / tokens.length : 0;

  return { phase, heard, hint, result, error, progress, start, stop, reset };
}
