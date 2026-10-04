export interface Chunk {
  title: string;
  /** Verbatim note text for this chunk, Markdown-formatted. */
  markdown: string;
  lastScore?: number;
  bestScore?: number;
}

export interface Note {
  id: string;
  title: string;
  subject: string;
  /** Hard terms from the note — biases live speech recognition toward them. */
  glossary: string[];
  chunks: Chunk[];
  createdAt: number;
  updatedAt: number;
}

export type NewNote = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export interface AppUser {
  uid: string;
  email: string | null;
  name: string | null;
}
