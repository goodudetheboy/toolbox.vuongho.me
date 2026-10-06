import { useCallback, useState } from 'react';

// Per-device preferences (localStorage). Only the hint limit for now.

export const HINT_LIMITS = [3, 5, 10, 20, Infinity] as const;
const HINT_LIMIT_KEY = 'study-assistant:hint-limit';
const DEFAULT_HINT_LIMIT = 5;

function load(): number {
  try {
    const raw = localStorage.getItem(HINT_LIMIT_KEY);
    if (raw === 'inf') return Infinity;
    const n = Number(raw);
    return (HINT_LIMITS as readonly number[]).includes(n) ? n : DEFAULT_HINT_LIMIT;
  } catch {
    return DEFAULT_HINT_LIMIT;
  }
}

/** Max hints per recitation (auto + Hint button). */
export function useHintLimit(): [number, (n: number) => void] {
  const [limit, setLimit] = useState(load);
  const update = useCallback((n: number) => {
    setLimit(n);
    try {
      localStorage.setItem(HINT_LIMIT_KEY, n === Infinity ? 'inf' : String(n));
    } catch {
      // just a preference
    }
  }, []);
  return [limit, update];
}
