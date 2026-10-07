import purrUrl from '../assets/purr.m4a?url';

// Biggu's purr, played when she taps (pets) him. Only ever on a tap, never automatically, and
// never stacked: a tap while he's still purring does nothing. The clip is 10 s of the real Biggu
// (trimmed, high-passed and leveled from a phone recording; see the ADR addendum "tap to pet").

let audio: HTMLAudioElement | null = null;
let done: (() => void) | null = null;

/** Starts a purr; `onEnd` runs when it finishes or is stopped. Returns false if one is already playing. */
export function purr(onEnd: () => void): boolean {
  if (done) return false;
  audio ??= new Audio(purrUrl);
  audio.currentTime = 0;
  done = () => {
    done = null;
    onEnd();
  };
  audio.onended = () => done?.();
  audio.play().catch(() => done?.());
  return true;
}

/** Stops a purr in progress — e.g. she starts reciting, so the mic never hears a cat. */
export function stopPurr(): void {
  audio?.pause();
  done?.();
}
