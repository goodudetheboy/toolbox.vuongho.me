import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type GradedIdea } from './api';
import { startLive, type LiveSession } from './live';
import { startMic, type MicHandle } from './mic';
import { decodeSpeech, play } from './sound';
import { align, nextHint, phraseFrom, type Token } from './words';

// The talking-mode loop: microphone → Gemini Live transcript → on-device word
// tracking. Pauses are detected on the device (not by Gemini) so the hint fires
// on time: after PREFETCH_MS of quiet the hint (text + audio) is fetched in the
// background, after HINT_MS it's shown (and spoken, when SPEAK_HINTS). She can also ask with the
// Hint button any time. First hint is a short cue for the idea she's stuck on
// (Gemini picks the key words, ≤10); if she's still stuck, the note's exact next
// words. Words a hint gives away never count as remembered.

const PREFETCH_MS = 1000;
const HINT_MS = 3000;
const TICK_MS = 200;
/** How long a hint stays on screen (the bubble shows a countdown ring). */
export const HINT_VISIBLE_MS = 5000;
/** Biggu speaking hints aloud (/speak TTS) — switched off for now at the user's request. */
const SPEAK_HINTS = false;

export type Phase = 'idle' | 'connecting' | 'listening' | 'scoring' | 'result';
export type WordStatus = 'said' | 'hinted' | 'missed';

export interface Hint {
  indices: number[];
  text: string;
}

type PlannedHint = Hint & { audio: Promise<AudioBuffer | null> | null };
type ShownHint = Hint & { id: number };

export interface Result {
  statuses: WordStatus[];
  percent: number;
  /** Hints shown during this recitation. */
  hints: number;
  /** Everything below is kept only so session feedback can save what happened (see feedback.ts). */
  transcript: string;
  hintLog: HintLogEntry[];
  /** 'gemini' = idea grading; 'offline' = the on-device word-match fallback. */
  gradedBy: 'gemini' | 'offline';
  ideas: GradedIdea[];
  models: { transcribe: string | null; grade: string | null };
  durationMs: number;
}

export interface HintLogEntry {
  text: string;
  /** Word indices the hint gave away. */
  indices: number[];
  /** ms since she started talking. */
  atMs: number;
  /** true = she tapped Hint; false = Biggu offered it after a pause. */
  manual: boolean;
}

function cleanForSpeech(words: string[]): string {
  return words.join(' ').replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
}

/** `hintLimit`: max hints (auto + button) per recitation; Infinity for no limit. */
export function useRecitation(tokens: Token[], vocabulary: string[], hintLimit: number) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [hint, setHint] = useState<ShownHint | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const hintsUsedRef = useRef(0);
  const hintLimitRef = useRef(hintLimit);
  hintLimitRef.current = hintLimit;
  const [error, setError] = useState<'mic' | 'other' | null>(null);

  const alignment = useMemo(() => align(tokens, heard), [tokens, heard]);

  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  const lastActivity = useRef(0);
  const hintLevel = useRef(0);
  const hinted = useRef(new Set<number>());
  const hintLog = useRef<HintLogEntry[]>([]);
  const startedAt = useRef(0);
  const speechCache = useRef(new Map<string, Promise<AudioBuffer | null>>());
  const hintCache = useRef(new Map<string, Promise<PlannedHint | null>>());
  const hintBusy = useRef(false);
  const lastHint = useRef<number[]>([]);
  const hintShowing = useRef(false);
  hintShowing.current = hint !== null;
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

  // Any new recognized speech counts as activity; once she says past the last hint, the next
  // stall starts again from a concept cue.
  useEffect(() => {
    if (phase !== 'listening') return;
    lastActivity.current = Date.now();
    if (lastHint.current.some((i) => alignment.said.has(i) || i < alignment.cursor)) {
      lastHint.current = [];
      hintLevel.current = 0;
    }
  }, [heard]); // eslint-disable-line react-hooks/exhaustive-deps

  // A hint stays up for HINT_VISIBLE_MS, then goes away on its own. Silence is only counted
  // once it's gone, so the quiet clock restarts when it hides.
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => {
      setHint(null);
      lastActivity.current = Date.now();
    }, HINT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

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
        p = picked.then((h) => (h.text ? { ...h, audio: SPEAK_HINTS ? speech(h.text) : null } : null));
        hintCache.current.set(key, p);
      }
      return p;
    },
    [tokens, speech],
  );

  /** Shows and speaks the next hint. Auto hints are dropped if she starts talking while it loads. */
  const giveHint = useCallback(
    async (manual: boolean) => {
      if (hintBusy.current || hintsUsedRef.current >= hintLimitRef.current) return;
      const pending = planHint(Math.min(hintLevel.current, 1));
      if (!pending) return;
      hintBusy.current = true;
      const quietSince = lastActivity.current;
      setHintLoading(true);
      try {
        const planned = await pending;
        if (!planned || !micRef.current || (!manual && lastActivity.current !== quietSince)) return;
        hintLevel.current = Math.min(hintLevel.current + 1, 2);
        hintsUsedRef.current += 1;
        setHintsUsed(hintsUsedRef.current);
        planned.indices.forEach((i) => hinted.current.add(i));
        hintLog.current.push({ text: planned.text, indices: planned.indices, atMs: Date.now() - startedAt.current, manual });
        lastHint.current = planned.indices;
        hintShowing.current = true; // before the re-render, so no pause tick slips in between
        setHint({ indices: planned.indices, text: planned.text, id: Date.now() });
        setHintLoading(false);
        const buffer = planned.audio && (await planned.audio);
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
  // While a hint is on screen or one is being fetched (auto or Hint button), silence doesn't
  // count; the quiet clock restarts when the hint hides.
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = window.setInterval(() => {
      if (hintShowing.current || hintBusy.current) return;
      if (hintsUsedRef.current >= hintLimitRef.current) return;
      if (hintLevel.current >= 2) return;
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
    hintLog.current = [];
    hintsUsedRef.current = 0;
    setHintsUsed(0);
    hintCache.current = new Map();
    hintLevel.current = 0;
    lastHint.current = [];
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
      startedAt.current = Date.now();
      setPhase('listening');
    } catch (err) {
      teardown();
      const name = (err as { name?: string }).name;
      setError(name === 'NotAllowedError' || name === 'NotFoundError' ? 'mic' : 'other');
      setPhase('idle');
    }
  }, [tokens, vocabulary, teardown]);

  /** Stops listening and scores what she said. */
  const stop = useCallback(async (): Promise<Result> => {
    const live = liveRef.current;
    micRef.current?.stop();
    micRef.current = null;
    setHint(null);
    setPhase('scoring');
    const durationMs = Date.now() - startedAt.current;
    const transcript = live ? await live.finish() : heard;
    teardown();

    const hintedNow = hinted.current;
    let statuses: WordStatus[];
    let percent: number;
    let gradedBy: Result['gradedBy'] = 'gemini';
    let ideas: GradedIdea[] = [];
    let gradeModel: string | null = null;
    try {
      // Gemini grades ideas, not words: paraphrase is fine, missing details are marked.
      const scored = await api.score(
        tokens.map((tk) => tk.display),
        transcript,
        [...hintedNow],
      );
      const missed = new Set(scored.missed);
      statuses = tokens.map((_, i) =>
        hintedNow.has(i) ? 'hinted' : missed.has(i) ? 'missed' : 'said',
      );
      percent = scored.percent;
      ideas = scored.ideas ?? [];
      gradeModel = scored.model ?? null;
    } catch {
      gradedBy = 'offline';
      // Offline fallback: the on-device word match.
      const said = align(tokens, transcript).said;
      statuses = tokens.map((_, i) => (hintedNow.has(i) ? 'hinted' : said.has(i) ? 'said' : 'missed'));
      const remembered = statuses.filter((st) => st === 'said').length;
      percent = tokens.length ? Math.round((100 * remembered) / tokens.length) : 0;
    }
    const result: Result = {
      statuses,
      percent,
      hints: hintsUsedRef.current,
      transcript,
      hintLog: hintLog.current,
      gradedBy,
      ideas,
      models: { transcribe: live?.model ?? null, grade: gradeModel },
      durationMs,
    };
    setResult(result);
    setPhase('result');
    return result;
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

  const hintsLeft = Math.max(0, hintLimit - hintsUsed);

  return { phase, heard, hint, hintLoading, hintsLeft, result, error, progress, start, stop, reset, askHint };
}
