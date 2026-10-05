export interface Chunk {
  title: string;
  /** Verbatim note text for this chunk, Markdown-formatted. */
  markdown: string;
  lastScore?: number;
  bestScore?: number;
}

/** One recorded recitation of a part, kept on the note for the progress history. */
export interface Attempt {
  at: number;
  /** Part index at the time (parts can be renamed but not reordered). */
  part: number;
  percent: number;
  hints: number;
}

export interface Note {
  id: string;
  title: string;
  subject: string;
  /** Hard terms from the note — biases live speech recognition toward them. */
  glossary: string[];
  chunks: Chunk[];
  /** Every recorded score, oldest first (missing on notes from before history existed). */
  history?: Attempt[];
  createdAt: number;
  updatedAt: number;
}

export type NewNote = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export interface AppUser {
  uid: string;
  email: string | null;
  name: string | null;
}
