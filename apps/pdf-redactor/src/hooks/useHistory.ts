import { useCallback, useEffect, useState } from 'react';
import {
  clearHistory,
  deleteHistoryEntry,
  listHistorySummaries,
  type HistorySummary,
} from '../lib/history';

export function useHistory() {
  const [entries, setEntries] = useState<HistorySummary[]>([]);

  const refresh = useCallback(async () => {
    setEntries(await listHistorySummaries());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await deleteHistoryEntry(id);
      await refresh();
    },
    [refresh],
  );

  const clear = useCallback(async () => {
    await clearHistory();
    await refresh();
  }, [refresh]);

  return { entries, refresh, remove, clear };
}
