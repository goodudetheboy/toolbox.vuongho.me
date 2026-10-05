export interface Chunk {
  title: string;
  /** Verbatim note text for this chunk, Markdown-formatted. */
  markdown: string;
  lastScore?: number;
  bestScore?: number;
  /** How many recitations are recorded (the attempts themselves are separate documents, see notes.ts). */
  tries?: number;
  /** Old on-chunk history — read only to migrate it into attempt documents. */
  history?: Attempt[];
}

/** One recorded recitation of a part — its own Firestore document (see notes.ts). */
export interface Attempt {
  at: number;
  percent: number;
  hints: number;
  /** One letter per recitable word: s(aid) / h(inted) / m(issed) — see `lib/marks.ts`. */
  marks?: string;
  /** Hash of the part's Markdown when recited; `marks` only line up while it still matches. */
  textHash?: string;
}

/** Note-level attempt from before history moved onto chunks; `part` is the chunk index. */
export interface LegacyAttempt extends Attempt {
  part: number;
}

export interface Note {
  id: string;
  title: string;
  subject: string;
  /** Hard terms from the note — biases live speech recognition toward them. */
  glossary: string[];
  chunks: Chunk[];
  /** Old note-level score history — read only to migrate it into attempt documents. */
  history?: LegacyAttempt[];
  createdAt: number;
  updatedAt: number;
}

export type NewNote = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export interface AppUser {
  uid: string;
  email: string | null;
  name: string | null;
}
