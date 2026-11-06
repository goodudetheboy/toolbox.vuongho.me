import { useRef } from 'react';

// How far past the edge a finger has to pull (twice this for a mouse wheel or
// trackpad, whose steps are bigger).
const PULL_PX = 80;

// Pulling on past a scroller's top or end (the alerts sheet's end goes back
// down to the board; the board's top is left for loading). A pull only
// counts when it starts with the scroller already at that edge, so a scroll (or
// a fling) that just reaches the edge doesn't trigger it too. Spread the
// returned handlers on the scrolling element.
export function usePullPast(edge: 'top' | 'end', onPull: () => void, enabled = true) {
  const touchFrom = useRef<number | null>(null); // finger's y when the pull began
  const wheel = useRef<{ sum: number; at: number } | null>(null);
  const sign = edge === 'top' ? 1 : -1; // which way the finger moves to pull
  const atEdge = (el: HTMLElement) =>
    edge === 'top' ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  const pull = () => {
    touchFrom.current = null;
    wheel.current = null;
    onPull();
  };

  return {
    onTouchStart(e: React.TouchEvent<HTMLElement>) {
      touchFrom.current = enabled && atEdge(e.currentTarget) ? e.touches[0].clientY : null;
    },
    onTouchMove(e: React.TouchEvent<HTMLElement>) {
      if (touchFrom.current !== null && sign * (e.touches[0].clientY - touchFrom.current) > PULL_PX) pull();
    },
    onWheel(e: React.WheelEvent<HTMLElement>) {
      // A wheel or trackpad gesture is a run of events; a pause starts a new one.
      const w = wheel.current;
      const fresh = !w || e.timeStamp - w.at > 250;
      if (fresh && !(enabled && atEdge(e.currentTarget))) return void (wheel.current = { sum: -Infinity, at: e.timeStamp });
      const sum = (fresh ? 0 : w.sum) + Math.max(0, -sign * e.deltaY);
      wheel.current = { sum, at: e.timeStamp };
      if (sum > PULL_PX * 2) pull();
    },
  };
}
