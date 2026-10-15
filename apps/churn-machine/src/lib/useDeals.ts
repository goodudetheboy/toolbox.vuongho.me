import { useEffect, useState } from 'react';
import type { DealsFile } from './types';

// deals.json is refreshed from Doctor of Credit on every deploy (and weekly, Mondays), see
// scripts/refresh-deals.mjs. Fetched rather than bundled so it can change without
// a new JS build.
export function useDeals() {
  const [data, setData] = useState<DealsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}deals.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DealsFile>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  return { data, error };
}
