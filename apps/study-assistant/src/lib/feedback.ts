import { collectionGroup, doc, getDocs, setDoc } from 'firebase/firestore';
import type { GradedIdea } from './api';
import { db } from './firebase';
import { encodeMarks } from './marks';
import { MOCK } from './mock';
import type { HintLogEntry, Result } from './useRecitation';

// "How was this session?" feedback, saved as raw material for tuning the prompts /
// models later. Each record is self-contained — it copies the part's text, the
// transcript, every hint and Gemini's grading — so it still makes sense after the
// note is edited or deleted. Lives at users/{uid}/feedback/{attemptId} (outside the
// note, so deleting a note keeps its feedback); re-rating the same session overwrites.

export type Rating = 'up' | 'down';
export const DOWN_REASONS = ['score', 'heard', 'hints', 'other'] as const;
export type DownReason = (typeof DOWN_REASONS)[number];

export interface FeedbackRecord {
  schema: 1;
  attemptId: string;
  createdAt: number;
  rating: Rating;
  /** Only for 👎: what felt off. */
  reasons: DownReason[];
  comment: string;
  /** Who rated it (added after the first records; older ones only have the uid in their path). */
  email?: string | null;
  noteId: string;
  noteTitle: string;
  subject: string;
  part: number;
  partTitle: string;
  /** The part's Markdown as it was when recited. */
  markdown: string;
  /** The recitable words the grading indices refer to. */
  words: string[];
  transcript: string;
  hintLog: HintLogEntry[];
  hintLimit: number | null;
  percent: number;
  /** One letter per word: s(aid) / h(inted) / m(issed). */
  marks: string;
  gradedBy: Result['gradedBy'];
  ideas: GradedIdea[];
  models: Result['models'];
  durationMs: number;
}

/** Everything about the session except the rating itself. */
export type SessionContext = Omit<FeedbackRecord, 'schema' | 'createdAt' | 'rating' | 'reasons' | 'comment'>;

export function sessionContext(args: {
  attemptId: string;
  note: { id: string; title: string; subject: string };
  part: number;
  partTitle: string;
  markdown: string;
  words: string[];
  hintLimit: number;
  result: Result;
}): SessionContext {
  const { result: r } = args;
  return {
    attemptId: args.attemptId,
    noteId: args.note.id,
    noteTitle: args.note.title,
    subject: args.note.subject,
    part: args.part,
    partTitle: args.partTitle,
    markdown: args.markdown,
    words: args.words,
    transcript: r.transcript,
    hintLog: r.hintLog,
    // Firestore can't store Infinity.
    hintLimit: Number.isFinite(args.hintLimit) ? args.hintLimit : null,
    percent: r.percent,
    marks: encodeMarks(r.statuses),
    gradedBy: r.gradedBy,
    ideas: r.ideas,
    models: r.models,
    durationMs: r.durationMs,
  };
}

const MOCK_KEY = 'study-assistant:mock-feedback';

export async function saveFeedback(
  uid: string,
  email: string | null,
  ctx: SessionContext,
  rating: Rating,
  reasons: DownReason[],
  comment: string,
): Promise<void> {
  const record: FeedbackRecord = { schema: 1, ...ctx, createdAt: Date.now(), email, rating, reasons, comment: comment.trim() };
  if (MOCK) {
    try {
      const all = JSON.parse(localStorage.getItem(MOCK_KEY) || '{}') as Record<string, FeedbackRecord>;
      all[ctx.attemptId] = record;
      localStorage.setItem(MOCK_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
    return;
  }
  await setDoc(doc(db, 'users', uid, 'feedback', ctx.attemptId), record);
}

// ---- admin: read everyone's feedback (firestore.rules lets only this account do it)

export const ADMIN_EMAIL = 'hochivuong2002@gmail.com';

export const isAdmin = (email: string | null | undefined) => MOCK || email === ADMIN_EMAIL;

export interface FeedbackEntry {
  uid: string;
  record: FeedbackRecord;
}

/** Every user's feedback, newest first. Sorted here — a collection-group orderBy would need its own index. */
export async function listAllFeedback(): Promise<FeedbackEntry[]> {
  let entries: FeedbackEntry[];
  if (MOCK) {
    const all = JSON.parse(localStorage.getItem(MOCK_KEY) || '{}') as Record<string, FeedbackRecord>;
    entries = Object.values(all).map((record) => ({ uid: 'mock-user', record }));
  } else {
    const snap = await getDocs(collectionGroup(db, 'feedback'));
    entries = snap.docs.map((d) => ({ uid: d.ref.parent.parent?.id ?? '?', record: d.data() as FeedbackRecord }));
  }
  return entries.sort((a, b) => b.record.createdAt - a.record.createdAt);
}
