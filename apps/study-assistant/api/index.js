// toolbox-study-assistant-api — the only place the Gemini API key lives.
//
// Every endpoint requires a Firebase ID token from an allowlisted, verified
// email (ALLOWED_EMAILS). The browser never sees the key: text work goes
// through these endpoints, and the live microphone stream connects straight to
// Gemini with a short-lived single-use token minted by /live-token.
// See apps/study-assistant/docs/adr/0001-study-assistant-architecture.md.

import http from 'node:http';
import { GoogleGenAI, Modality } from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { cleanMarkdown, sequenceSimilarity, words } from './text.js';

const PORT = Number(process.env.PORT || 8080);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TEXT_MODEL = process.env.TEXT_MODEL || 'gemini-3.8-flash';
const LIVE_MODEL = process.env.LIVE_MODEL || 'gemini-3.5-transcribe-live';
const TTS_MODEL = process.env.TTS_MODEL || 'gemini-3.8-flash-lite-tts';
const TTS_VOICE = process.env.TTS_VOICE || 'Kore';
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || 'https://toolbox.vuongho.me,http://localhost:5173'
).split(',');
const MAX_BODY_BYTES = 30 * 1024 * 1024;
// Pasted/Word notes get cleaned up (typos, citations…), so they won't come back word-for-word, but
// falling below this means content was probably dropped or rewritten. Keep in sync with NewNote.tsx.
const MIN_FIDELITY = 0.7;

if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY is not set — Gemini calls will fail.');
if (ALLOWED_EMAILS.length === 0) console.warn('ALLOWED_EMAILS is empty — every request will be refused.');

initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'vuonghome' });
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
// Ephemeral Live tokens only exist on v1alpha.
const aiAlpha = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- prepare

const PREPARE_INSTRUCTION = `You prepare a nursing student's study note so she can memorize it for an exam.
She will read one chunk at a time, then recite it aloud from memory.

RULES — follow all of them:
1. KEEP THE CONTENT, CLEAN THE CLUTTER. Keep all of the note's actual study content — every fact, term,
   number, list item and relationship, in the original order — and stay close to its wording, since that
   is what she memorizes. Never summarize, never drop content, never add facts, never translate.
   Do clean it up so it reads smoothly:
   - fix typos, spelling and obvious grammar slips; join words broken across lines ("hemo- globin");
   - remove clutter that isn't study content: citation and reference markers ("[12]", "(Smith, 2019)",
     "[citation needed]", superscript note numbers), URLs, "see Figure 3"/"Table 2" pointers, page numbers,
     running headers/footers, slide numbers, watermarks, stray symbols and leftover formatting characters;
   - you may lightly adjust a phrase so a sentence is coherent and easy to read (e.g. a fragment cut off by
     a page break), but don't rewrite sentences that already read fine.
   Medical terms, drug names, doses and abbreviations stay exactly as the note has them (fix only clear typos).
2. FORMAT — make it easy to read on a phone. Ignore the original layout (line breaks, indentation, spacing,
   bullet symbols, PDF columns, how it was typed) and lay the words out again as clean, well-structured
   Markdown, choosing whatever structure reads best:
   - a heading (##, ###) for a line that acts as a heading or label;
   - bullet lists for enumerations, numbered lists for steps or ordered sequences, nested lists for sub-points;
   - "term: definition" or "term – definition" lines as a bullet list item starting with the **term**;
   - a table when the content compares items across the same attributes (e.g. drug, dose, side effects);
   - short paragraphs, with a blank line between blocks.
   Formatting only: never add, drop, reorder or change words to do it — turning a run-on line into a list
   just moves the line breaks. Never use code blocks, block quotes or HTML; indent only nested list items.
   BOLD the key terms and short phrases critical to each chunk (usually 1-4 per chunk: the defining terms,
   numbers and relationships an exam would ask about), plus anything the original already had in bold.
   Bold only existing words; do not over-bold.
3. CHUNK. Split the note into chunks she can memorize in one sitting: one idea per chunk, usually 30-90
   words. Never split a sentence. Keep a heading with the content under it. Keep a short list together.
   The chunks, in order, must cover the whole note with no gaps and no overlap.
4. Each chunk gets a short "title" (2-6 words): the note's own heading for that part if it has one,
   otherwise its key terms. The title is a label, not part of the note text.
5. "subject": the academic subject in English (e.g. "Anatomy & Physiology", "Pharmacology",
   "Microbiology", "Fundamentals of Nursing").
6. "glossary": up to 40 technical terms exactly as spelled in the note (medical terms, drug names,
   abbreviations, Latin/Greek words) that a non-native speaker may find hard to say or hear.
7. "title": a short title for the whole note (from the note itself if it has one).`;

const PREPARE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subject: { type: 'string' },
    glossary: { type: 'array', items: { type: 'string' } },
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          markdown: { type: 'string' },
        },
        required: ['title', 'markdown'],
      },
    },
  },
  required: ['title', 'subject', 'glossary', 'chunks'],
};

async function generateJson({ instruction, input, schema, thinking = 'low' }) {
  const interaction = await ai.interactions.create({
    model: TEXT_MODEL,
    system_instruction: instruction,
    input,
    response_format: { type: 'text', mime_type: 'application/json', schema },
    generation_config: { thinking_level: thinking },
    store: false,
  });
  if (!interaction.output_text) throw new Error('Gemini returned no text');
  return JSON.parse(interaction.output_text);
}

async function prepare(body) {
  let input;
  let sourceText = null;
  if (body.kind === 'text' || body.kind === 'html') {
    sourceText = String(body.text || '');
    if (!sourceText.trim()) throw new HttpError(400, 'Empty note');
    const label = body.kind === 'html' ? 'The note (a Word document converted to HTML):' : 'The note:';
    input = [{ type: 'text', text: `${label}\n\n${sourceText}` }];
  } else if (body.kind === 'files') {
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) throw new HttpError(400, 'No files');
    input = [
      { type: 'text', text: 'The note is in these files, in order:' },
      ...files.map((f) =>
        f.mimeType === 'application/pdf'
          ? { type: 'document', data: f.data, mime_type: 'application/pdf' }
          : { type: 'image', data: f.data, mime_type: f.mimeType },
      ),
    ];
  } else {
    throw new HttpError(400, 'Unknown kind');
  }

  let result = await generateJson({ instruction: PREPARE_INSTRUCTION, input, schema: PREPARE_SCHEMA });
  let fidelity = null;
  if (sourceText !== null) {
    const source = words(sourceText);
    const measure = (r) => sequenceSimilarity(source, words(r.chunks.map((c) => c.markdown).join('\n')));
    fidelity = measure(result);
    if (fidelity < MIN_FIDELITY) {
      // One retry with the problem spelled out; keep whichever is closer to the original.
      const retry = await generateJson({
        instruction: PREPARE_INSTRUCTION,
        input: [
          ...input,
          {
            type: 'text',
            text: 'IMPORTANT: a previous attempt dropped or rewrote too much of the note. Keep all of its content and wording — only fix typos, remove clutter (citations, URLs…) and add Markdown formatting.',
          },
        ],
        schema: PREPARE_SCHEMA,
        thinking: 'medium',
      });
      const retryFidelity = measure(retry);
      if (retryFidelity > fidelity) {
        result = retry;
        fidelity = retryFidelity;
      }
    }
  }
  return {
    ...result,
    chunks: result.chunks.map((c) => ({ ...c, markdown: cleanMarkdown(c.markdown) })),
    glossary: result.glossary.slice(0, 40),
    fidelity,
  };
}

// ---------------------------------------------------------------- live token

function liveConfig(vocabulary) {
  return {
    responseModalities: [Modality.TEXT],
    inputAudioTranscription: {
      mode: 'VERBATIM',
      languageCodes: ['en-US'],
      // Biases recognition toward the note's own hard terms (accented speech + medical words).
      customVocabulary: vocabulary,
    },
  };
}

async function liveToken(body) {
  const vocabulary = (Array.isArray(body.vocabulary) ? body.vocabulary : [])
    .map((v) => String(v).trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 100);
  const config = liveConfig(vocabulary);
  const now = Date.now();
  const token = await aiAlpha.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
      // Locks the model and config to this token, so it can't be reused for anything else.
      liveConnectConstraints: { model: LIVE_MODEL, config },
    },
  });
  return { token: token.name, model: LIVE_MODEL, config };
}

// ---------------------------------------------------------------- speak

async function speak(body) {
  const text = String(body.text || '').trim();
  if (!text || text.length > 300) throw new HttpError(400, 'Bad text');
  const interaction = await ai.interactions.create({
    model: TTS_MODEL,
    // Just the words: the TTS model reads any instruction text aloud too.
    input: text,
    generation_config: { speech_config: [{ voice: TTS_VOICE, language: 'en-US' }] },
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    store: false,
  });
  const audio = interaction.output_audio;
  if (!audio?.data) throw new Error('Gemini returned no audio');
  return { data: audio.data, mimeType: audio.mime_type || 'audio/wav' };
}

// ---------------------------------------------------------------- hint

const HINT_SCHEMA = {
  type: 'object',
  properties: {
    hint: { type: 'string' },
    covers: { type: 'array', items: { type: 'integer' } },
  },
  required: ['hint', 'covers'],
};
const HINT_MAX_WORDS = 10;

async function hint(body) {
  const passage = Array.isArray(body.words) ? body.words.map(String) : [];
  if (passage.length === 0 || passage.length > 2000) throw new HttpError(400, 'Bad passage');
  const from = Number(body.from);
  if (!Number.isInteger(from) || from < 0 || from >= passage.length) throw new HttpError(400, 'Bad position');
  const said = new Set((Array.isArray(body.said) ? body.said : []).filter(Number.isInteger));
  const transcript = String(body.transcript || '').slice(-600);

  const numbered = passage.map((w, i) => `${i}:${w}${said.has(i) ? '✓' : ''}`).join(' ');
  const result = await generateJson({
    instruction: `A nursing student is reciting a passage of her study notes from memory and has gone quiet —
she is stuck. Her first language is Vietnamese. Give her a short cue so she can pick the passage back up.

- Find the idea she is stuck on: the part of the passage starting at the given word index that she has
  not said yet (words she already said are marked ✓). That is usually the next term, the next part of a
  definition, a list item, a number or a relationship.
- "hint": a cue of at most ${HINT_MAX_WORDS} words (aim for 3-8) built from the passage's own key words for
  that idea — the concept itself, not the grammar around it. E.g. if she is defining a term and forgot the
  second half of the definition, give the key words of that missing half. Never give just a filler word
  ("the", "is", "and", "which"). Drop filler; keep the content words in the passage's wording and order so
  she recognizes it. Only cover the next idea — do not give away the rest of the passage, and do not repeat
  what she already said. No quotes, no ending punctuation.
- "covers": the indices of the passage words your cue gives away.`,
    input: `Passage (index:word, ✓ = already said):\n${numbered}\n\nShe is stuck at word ${from}.\n\nThe last thing she said:\n${transcript || '(nothing yet)'}`,
    schema: HINT_SCHEMA,
  });
  const text = String(result.hint || '')
    .replace(/["“”]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, HINT_MAX_WORDS)
    .join(' ')
    .replace(/[.,;:!?]+$/, '');
  const covers = [...new Set(result.covers)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < passage.length && !said.has(i))
    .sort((a, b) => a - b)
    .slice(0, 2 * HINT_MAX_WORDS);
  return { hint: text, covers };
}

// ---------------------------------------------------------------- score

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    said: { type: 'array', items: { type: 'integer' } },
    close: { type: 'array', items: { type: 'integer' } },
  },
  required: ['said', 'close'],
};

async function score(body) {
  const passage = Array.isArray(body.words) ? body.words.map(String) : [];
  const transcript = String(body.transcript || '');
  if (passage.length === 0 || passage.length > 2000) throw new HttpError(400, 'Bad passage');
  if (!transcript.trim()) return { said: [], close: [] };

  const numbered = passage.map((w, i) => `${i}:${w}`).join(' ');
  const result = await generateJson({
    instruction: `A nursing student recited a passage from memory. Her first language is Vietnamese, so her
pronunciation may be off, and the transcript comes from speech-to-text, so hard words may be misheard
(e.g. "a rid row site" for "erythrocyte"). She may say parts in a different order — that is fine.

For each numbered word of the passage, decide whether she said it.
- Count it as said if the transcript has that word, or a recognizable mispronunciation or mis-hearing of it,
  in a matching context. Order does not matter.
- Do not credit a word just because a common word ("the", "and", "of") appears somewhere unrelated.
- "said": indices of every word she said. "close": the subset of "said" that was noticeably mispronounced
  or misheard (so she can practise them).`,
    input: `Passage (index:word):\n${numbered}\n\nTranscript of what she said:\n${transcript}`,
    schema: SCORE_SCHEMA,
  });
  const valid = (xs) => [...new Set(xs)].filter((i) => Number.isInteger(i) && i >= 0 && i < passage.length);
  const said = valid(result.said);
  const saidSet = new Set(said);
  return { said, close: valid(result.close).filter((i) => saidSet.has(i)) };
}

// ---------------------------------------------------------------- http

const ROUTES = { '/prepare': prepare, '/live-token': liveToken, '/speak': speak, '/hint': hint, '/score': score };

async function authenticate(req) {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!idToken) throw new HttpError(401, 'Not signed in');
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    throw new HttpError(401, 'Invalid sign-in');
  }
  const email = (decoded.email || '').toLowerCase();
  if (!decoded.email_verified || !ALLOWED_EMAILS.includes(email)) throw new HttpError(403, 'Not allowed');
  return email;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Too large'));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
  const handler = ROUTES[path];
  if (!handler || req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  try {
    const email = await authenticate(req);
    const body = await readJson(req);
    const started = Date.now();
    const result = await handler(body);
    console.log(JSON.stringify({ path, email, ms: Date.now() - started }));
    send(res, 200, result);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 502;
    if (status >= 500) console.error(path, err);
    send(res, status, { error: status >= 500 ? 'Gemini request failed' : err.message });
  }
});

server.requestTimeout = 0; // long notes can take a while; Cloud Run's own timeout applies
server.listen(PORT, () => console.log(`study-assistant api listening on ${PORT}`));
