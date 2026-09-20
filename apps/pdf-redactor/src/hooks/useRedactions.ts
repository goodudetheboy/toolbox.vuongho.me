import { useCallback, useState } from 'react';
import type { PageRedactions, RedactionRect } from '../types';

export function useRedactions() {
  const [redactions, setRedactions] = useState<PageRedactions>({});

  const addRect = useCallback((page: number, rect: RedactionRect) => {
    setRedactions((prev) => ({
      ...prev,
      [page]: [...(prev[page] ?? []), rect],
    }));
  }, []);

  const undoLast = useCallback((page: number) => {
    setRedactions((prev) => {
      const rects = prev[page];
      if (!rects || rects.length === 0) return prev;
      return { ...prev, [page]: rects.slice(0, -1) };
    });
  }, []);

  const clearPage = useCallback((page: number) => {
    setRedactions((prev) => {
      if (!prev[page]) return prev;
      const next = { ...prev };
      delete next[page];
      return next;
    });
  }, []);

  const deleteRect = useCallback((page: number, index: number) => {
    setRedactions((prev) => {
      const rects = prev[page];
      if (!rects || index < 0 || index >= rects.length) return prev;
      return { ...prev, [page]: rects.filter((_, i) => i !== index) };
    });
  }, []);

  const replaceAll = useCallback((next: PageRedactions) => {
    setRedactions(next);
  }, []);

  return { redactions, addRect, undoLast, clearPage, deleteRect, replaceAll };
}
