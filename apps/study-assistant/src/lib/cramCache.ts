// Keeps a cram sheet as she left it while she pops into a part (the book button) and comes back:
// same ranked list, "give meow more" loads, note filter, encouragement notes and scroll position,
// no rebuild. In memory only. Opening the exam fresh from the Exams tab rebuilds it (Home calls
// forgetCramSheets), so new tries count from then on.

export interface CramSheetState<Idea> {
  /** Which text the sheet was built from; a different one (an edit) rebuilds it. */
  signature: string;
  ideas: Idea[];
  pages: number;
  hidden: Set<string>;
  cheerSeed: number;
  scrollY: number;
}

const sheets = new Map<string, CramSheetState<unknown>>();

export function cachedSheet<Idea>(examId: string, signature: string): CramSheetState<Idea> | null {
  const s = sheets.get(examId) as CramSheetState<Idea> | undefined;
  return s && s.signature === signature ? s : null;
}

export function saveSheet<Idea>(examId: string, state: CramSheetState<Idea>): void {
  sheets.set(examId, state);
}

export function forgetCramSheets(examId?: string): void {
  if (examId) sheets.delete(examId);
  else sheets.clear();
}
