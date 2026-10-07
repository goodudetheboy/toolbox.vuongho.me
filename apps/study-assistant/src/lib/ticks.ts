// "I remember this" ticks on an exam's cram sheet. Kept on this device only (localStorage),
// by design: they're a reading aid, never synced and never part of the ranking. Keys include
// the part's text hash, so editing a part quietly clears its ticks.

const storageKey = (examId: string) => `study-assistant:exam-ticks:${examId}`;

export function loadTicks(examId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(examId)) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function saveTicks(examId: string, ticks: Set<string>): void {
  try {
    localStorage.setItem(storageKey(examId), JSON.stringify([...ticks]));
  } catch {
    // just a reading aid
  }
}

export function clearTicks(examId: string): void {
  try {
    localStorage.removeItem(storageKey(examId));
  } catch {
    // ignore
  }
}
