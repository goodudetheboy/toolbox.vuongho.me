import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { speechPieces, type Piece } from './readAloud';
import { decodeSpeech } from './sound';
import { cachedSpeech } from './speechCache';
import type { Token } from './words';

// "Listen": Biggu reads the part aloud with the same /speak TTS as hints, one piece
// (a sentence or two) at a time. The next two pieces are fetched while one plays, so
// there's no gap waiting on Gemini after the first. Audio is cached (speechCache.ts),
// so a second listen costs no /speak calls.

const AHEAD = 2;

export function useReadAloud(tokens: Token[]) {
  const pieces = useMemo(() => speechPieces(tokens), [tokens]);
  /** The piece being read (or loaded), null when stopped. */
  const [current, setCurrent] = useState<Piece | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);

  const stop = useCallback(() => {
    run.current += 1;
    srcRef.current?.stop();
    srcRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setCurrent(null);
    setLoading(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setFailed(false);
    if (!pieces.length) return;
    const id = run.current;
    // Created inside the tap, or iOS keeps it suspended.
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const audio: Promise<AudioBuffer>[] = [];
    const fetchPiece = (i: number) => {
      if (i < pieces.length && !audio[i]) {
        audio[i] = cachedSpeech(pieces[i].text).then((r) => decodeSpeech(ctx, r.data, r.mimeType));
        audio[i].catch(() => {}); // awaited (and reported) when its turn comes
      }
    };
    try {
      for (let i = 0; i < pieces.length; i++) {
        for (let k = i; k <= i + AHEAD; k++) fetchPiece(k);
        setCurrent(pieces[i]);
        setLoading(true);
        const buffer = await audio[i];
        if (run.current !== id) return;
        setLoading(false);
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(ctx.destination);
          src.onended = () => resolve();
          srcRef.current = src;
          src.start();
        });
        if (run.current !== id) return;
      }
      stop();
    } catch {
      if (run.current !== id) return;
      stop();
      setFailed(true);
    }
  }, [pieces, stop]);

  // Leaving the part stops it.
  useEffect(() => stop, [stop]);

  return { current, loading, playing: current !== null, failed, start, stop };
}
