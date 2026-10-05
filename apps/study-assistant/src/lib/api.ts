import { idToken } from './auth';
import { MOCK } from './mock';
import type { NewNote } from './types';

// Calls to toolbox-study-assistant-api (Cloud Run). Its URL is injected at build
// time by CI (VITE_STUDY_API_URL); everything authenticates with the user's
// Firebase ID token, and the server checks the email allowlist.

const API_URL = (import.meta.env.VITE_STUDY_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '')).replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'API not configured');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error || `HTTP ${res.status}`);
  return data as T;
}

export type PrepareInput =
  | { kind: 'text'; text: string }
  | { kind: 'html'; text: string }
  | { kind: 'files'; files: { data: string; mimeType: string }[] };

export type Prepared = Omit<NewNote, 'chunks'> & {
  chunks: { title: string; markdown: string }[];
  /** For pasted/Word notes: how word-for-word the result is (1 = exact). Null for PDFs/photos. */
  fidelity: number | null;
};

export interface LiveTokenResponse {
  token: string;
  model: string;
  config: Record<string, unknown>;
}

export interface ScoreResponse {
  /** How much of the part's ideas she got, 0-100 (concept-level, not word-by-word). */
  percent: number;
  /** Word indices of details she left out or got wrong. */
  missed: number[];
  /** Gemini's split of the part into ideas and how each was graded (saved with feedback). */
  ideas?: GradedIdea[];
  /** Text model that graded it. */
  model?: string | null;
}

export interface GradedIdea {
  /** Inclusive word indices. */
  start: number;
  end: number;
  score: number;
  missed: number[];
}

export interface HintRequest {
  words: string[];
  /** Indices she has already said. */
  said: number[];
  /** First word she hasn't said, where she's stuck. */
  from: number;
  transcript: string;
}

export interface HintResponse {
  /** A short cue (≤10 words) for the idea she's stuck on. */
  hint: string;
  /** Passage word indices the cue gives away. */
  covers: number[];
}

export interface SpeakResponse {
  data: string;
  mimeType: string;
}

const real = {
  prepare: (input: PrepareInput) => post<Prepared>('/prepare', input),
  liveToken: (vocabulary: string[]) => post<LiveTokenResponse>('/live-token', { vocabulary }),
  speak: (text: string) => post<SpeakResponse>('/speak', { text }),
  hint: (req: HintRequest) => post<HintResponse>('/hint', req),
  score: (words: string[], transcript: string, hinted: number[]) =>
    post<ScoreResponse>('/score', { words, transcript, hinted }),
};

export type Api = typeof real;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mock: Api = {
  async prepare() {
    await delay(1500);
    return {
      title: 'The Heart',
      subject: 'Anatomy & Physiology',
      glossary: ['myocardium', 'atrium', 'ventricle', 'erythrocyte'],
      fidelity: 1,
      chunks: [
        {
          title: 'Heart wall',
          markdown:
            '## The heart wall\n\nThe heart wall has three layers: the **epicardium**, the **myocardium** and the **endocardium**.',
        },
        {
          title: 'Chambers',
          markdown:
            '## Chambers\n\n- The right **atrium** receives blood from the body.\n- The left **ventricle** pumps blood to the body.',
        },
        {
          title: 'Red blood cells',
          markdown: 'An **erythrocyte** carries oxygen using haemoglobin.',
        },
      ],
    };
  },
  async liveToken() {
    return { token: 'mock', model: 'mock', config: {} };
  },
  async speak() {
    await delay(300);
    // 0.4 s of a soft 440 Hz beep as 16-bit PCM WAV, so hint playback can be exercised.
    return { data: mockBeepWav(), mimeType: 'audio/wav' };
  },
  async hint({ words, from }) {
    await delay(700);
    // Rough stand-in for Gemini: the next few content words, skipping filler.
    const filler = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'is', 'has', 'from', 'using', 'with']);
    const covers: number[] = [];
    for (let i = from; i < words.length && covers.length < 5; i++) {
      if (!filler.has(words[i].toLowerCase().replace(/[^a-z]/g, ''))) covers.push(i);
    }
    return { hint: covers.map((i) => words[i].replace(/[.,;:]+$/, '')).join(' '), covers };
  },
  async score(words, transcript) {
    await delay(500);
    const spoken = new Set(transcript.toLowerCase().split(/\s+/));
    const said = words.map((w) => spoken.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const missed = said.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0);
    return {
      percent: Math.round((100 * (words.length - missed.length)) / Math.max(1, words.length)),
      missed,
      ideas: [{ start: 0, end: words.length - 1, score: 100 - Math.round((100 * missed.length) / Math.max(1, words.length)), missed }],
      model: 'mock',
    };
  },

};

function mockBeepWav(): string {
  const rate = 16000;
  const n = rate * 0.4;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 3000, true);
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export const api: Api = MOCK ? mock : real;
