import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { startLive, type LiveSession } from './live';
import { startMic, type MicHandle } from './mic';
import { decodeSpeech, play } from './sound';
import { align, nextHint, phraseFrom, type Token } from './words';

// The talking-mode loop: microphone → Gemini Live transcript → on-device word
// tracking. Pauses are detected on the device (not by Gemini) so the hint fires
// on time: after PREFETCH_MS of quiet the hint (text + audio) is fetched in the
// background, after HINT_MS it's shown and spoken. She can also ask with the
// Hint button any time. First hint is a short cue for the idea she's stuck on
// (Gemini picks the key words, ≤10); if she's still stuck, the note's exact next
// words. Words a hint gives away never count as remembered.

const PREFETCH_MS = 1000;
const HINT_MS = 3000;
const TICK_MS = 200;

export type Phase = 'idle' | 'connecting' | 'listening' | 'scoring' | 'result';
export type WordStatus = 'said' | 'close' | 'hinted' | 'missed';

export interface Hint {
  indices: number[];
  text: string;
}

type PlannedHint = Hint & { audio: Promise<AudioBuffer | null> };

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
  const [hintLoading, setHintLoading] = useState(false);
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
  const hintCache = useRef(new Map<string, Promise<PlannedHint | null>>());
  const hintBusy = useRef(false);
  const heardRef = useRef(heard);
  heardRef.current = heard;
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

  /** The hint for where she's stuck right now at this level (0 = cue, 1 = exact words), fetched once. */
  const planHint = useCallback(
    (level: number): Promise<PlannedHint | null> | null => {
      const al = alignmentRef.current;
      const from = nextHint(tokens, al, 1)[0];
      if (from === undefined) return null;
      const key = `${from}:${level}`;
      let p = hintCache.current.get(key);
      if (!p) {
        const exact = (): Hint => {
          const indices = phraseFrom(tokens, from);
          return { indices, text: cleanForSpeech(indices.map((i) => tokens[i].display)) };
        };
        const picked: Promise<Hint> =
          level === 0
            ? api
                .hint({ words: tokens.map((tk) => tk.display), said: [...al.said], from, transcript: heardRef.current })
                .then((r) => (r.hint ? { text: r.hint, indices: r.covers.length ? r.covers : [from] } : exact()))
                .catch(exact)
            : Promise.resolve(exact());
        p = picked.then((h) => (h.text ? { ...h, audio: speech(h.text) } : null));
        hintCache.current.set(key, p);
      }
      return p;
    },
    [tokens, speech],
  );

  /** Shows and speaks the next hint. Auto hints are dropped if she starts talking while it loads. */
  const giveHint = useCallback(
    async (manual: boolean) => {
      if (hintBusy.current) return;
      const pending = planHint(Math.min(hintLevel.current, 1));
      if (!pending) return;
      hintBusy.current = true;
      const quietSince = lastActivity.current;
      setHintLoading(true);
      try {
        const planned = await pending;
        if (!planned || !micRef.current || (!manual && lastActivity.current !== quietSince)) return;
        hintLevel.current = Math.min(hintLevel.current + 1, 2);
        planned.indices.forEach((i) => hinted.current.add(i));
        setHint({ indices: planned.indices, text: planned.text });
        setHintLoading(false);
        const buffer = await planned.audio;
        if (buffer && ctxRef.current) await play(ctxRef.current, buffer);
      } finally {
        hintBusy.current = false;
        setHintLoading(false);
        // Don't count the wait or the hint's own playback as quiet time.
        lastActivity.current = Date.now();
      }
    },
    [planHint],
  );

  // Pause detector: prefetch, then hint. After both hints, wait for her to speak again.
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = window.setInterval(() => {
      if (hintLevel.current >= 2 || hintBusy.current) return;
      const quiet = Date.now() - lastActivity.current;
      if (quiet < PREFETCH_MS) return;
      planHint(hintLevel.current);
      if (quiet >= HINT_MS) void giveHint(false);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase, planHint, giveHint]);

  const askHint = useCallback(() => {
    if (phase === 'listening') void giveHint(true);
  }, [phase, giveHint]);

  const start = useCallback(async () => {
    setError(null);
    setHeard('');
    setHint(null);
    setResult(null);
    hinted.current = new Set();
    hintCache.current = new Map();
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

  return { phase, heard, hint, hintLoading, result, error, progress, start, stop, reset, askHint };
}
