# 0001. Study assistant: Gemini behind a small Cloud Run API, live transcription in the browser

Status: Accepted

## Context

A nursing student (English is her second language) pastes, uploads or
photographs a study note. The tool must split it **word for word** into
memorizable parts, nicely formatted, then let her recite each part aloud:
if she pauses ~3 s, a hint (the next word) appears on screen and is spoken;
when she stops, she sees what percent of the part she remembered and what she
missed. Notes and scores sync between her phone and laptop. Gemini for all AI
work, with a key dedicated to this tool. Only two Google accounts may use it.

Constraints: an API key can't ship to the browser; the toolbox-wide
convention (toolbox-wide ADR 0004) is one Cloud Run service and one named
Firestore database per tool that needs them, in `us-central1`; Firebase
Hosting rewrites to Cloud Run time out at 60 s, and splitting a long note
can take longer.

## Decision

**Backend — `toolbox-study-assistant-api` (Cloud Run, `api/`).** Plain Node
(`node:http`), deployed from source by CI. Holds the Gemini key (Secret
Manager secret `study-assistant-gemini-key`). Every request needs a Firebase
ID token of a verified email in `ALLOWED_EMAILS`. Called directly at its
`run.app` URL (CORS-limited to the site), not through a Hosting rewrite, to
avoid the 60 s limit. Endpoints:

- `/prepare` — `gemini-3.8-flash` (Interactions API, JSON schema output):
  returns title, subject, glossary of hard terms, and parts as Markdown.
  The prompt forbids changing words and only allows formatting; if the note
  has no bold, Gemini bolds the 1–4 key phrases per part. For pasted/Word
  text the server measures word-sequence similarity to the source and
  retries once below 0.97; the UI warns if it's still low. PDFs and photos
  go to Gemini as-is (Word is converted to HTML in the browser first —
  Gemini can't read .docx).
- `/live-token` — mints a single-use, short-lived **ephemeral token** locked
  to `gemini-3.5-transcribe-live` in VERBATIM mode, `en-US`, with the note's
  glossary + the part's long words as `customVocabulary` (accented speech +
  medical terms). The browser streams mic audio straight to Gemini Live with
  it; the real key never leaves the server.
- `/speak` — `gemini-3.8-flash-lite-tts`, "Say slowly and clearly: …", WAV.
- `/score` — `gemini-3.8-flash` decides which numbered words of the part
  she said, tolerant of accent, mis-hearing and reordering; also flags
  "say it clearer" words.

Model ids are env vars with those defaults, since Gemini model names change
often.

**Talking mode (browser).** An AudioWorklet (inlined as a Blob URL so dev and
prod load it the same way) turns the mic into 16 kHz PCM for Gemini Live.
The transcript is matched on-device against the part (`src/lib/words.ts`:
accent-tolerant for long words, exact for short ones, re-joins split terms)
to know where she is. **Pauses are detected on the device**, not by Gemini:
a mic-level detector with an adaptive noise floor (absorbs steady fan/TV
noise) plus transcript updates. At 1.5 s of quiet the hint audio is
prefetched, at 3 s it's shown + spoken (next word; if still stuck, next three).
Hinted words never count as remembered. Echo cancellation keeps the spoken
hint from being heard as her answer.

**Score** = words said (Gemini's judgement ∪ the on-device match) that
weren't hinted, over all words. Headings are labels and aren't recited.

**Data.** Firestore database `toolbox-study-assistant`,
`users/{uid}/notes/{noteId}` with parts (and last/best score) inline. Rules
allow only the owner, only allowlisted verified emails. Same shared Firebase
web config/Auth as trip-planner.

**UI.** English, light-blue scrapbook style of its own (graph paper, washi
tape, polaroids, index cards, stamps) with Biggu, a brown-grey tabby drawn
in SVG as a die-cut sticker in eight moods. Progressive disclosure: each
screen shows one main action; inputs and options appear only once they're
needed.

**CI.** `deploy.yml` deploys the API (only when `api/` or the workflow
changed, or the service doesn't exist), injects its URL as
`VITE_STUDY_API_URL` for the frontend build, and publishes Firestore rules —
all gated on the repo variable `STUDY_ASSISTANT_ENABLED`, so the toolbox keeps
deploying before the one-time console setup (`docs/SETUP.md`) is done.

## Consequences

- No key in the browser; a leaked ID token only works for allowlisted
  accounts; ephemeral Live tokens are single-use and expire in minutes.
- Untested against the live Gemini API at build time (no key in the build
  environment): request shapes were checked against the `@google/genai`
  2.27 SDK types and captured HTTP bodies, and the whole UI flow runs
  against in-memory fakes (`VITE_MOCK=1`). First real use should be watched.
- Recognition quality for her accent is the main unknown; the levers are the
  custom vocabulary, the matcher's tolerance (`wordsMatch`) and the scoring
  prompt.
- Cost is per use (Gemini + Cloud Run scale to zero); max 3 instances.

## Addendum 2026-10-05 — no more enable flag

The CI steps were first gated on a repo variable `STUDY_ASSISTANT_ENABLED` so
the toolbox kept deploying before the one-time setup was done. With setup
complete, the user asked for the flag to go: the API deploy and Firestore
rules publish now run on every push to `main`. Trade-off: if the cloud setup
(secret, IAM roles, database) is ever undone, the whole Deploy run fails, not
just the study assistant.

## Addendum 2026-10-05 — concept hints, Hint button, reformatting, editing

Supersedes the hint and formatting parts of the Decision above, at the
user's request:

- **Hints are concept cues, not single words.** One word (often "the") didn't
  help. The first hint now comes from a new `/hint` endpoint: Gemini gets the
  numbered passage with the words she's said marked and returns a cue of at
  most 10 words — the key words of the idea she's stuck on (e.g. the missing
  half of a definition), in the note's own wording, no filler — plus the
  indices it gives away (those count as hinted). If she's still stuck, the
  second hint is the note's exact next words (≤10, to the clause end), made
  on-device. If `/hint` fails, the exact words are used straight away.
  Prefetch moved to 1 s of quiet so the extra Gemini round trip mostly fits
  before the 3 s mark. Cost: one small text call per stall.
- **Hint button** on the talking screen, next to Done: same hint on demand,
  any time; tapping again escalates to the exact words.
- **Reformat, don't preserve.** `/prepare` no longer keeps the source's
  structure; it lays the (still verbatim) words out again as readable
  Markdown — headings, lists, term/definition items, tables — and always
  bolds key terms. Code fences / 4-space indents (which render as raw text)
  are stripped server-side.
- **Editing.** Each part can be edited (title + text) from its read screen,
  in a Rich text mode (contenteditable over HTML from `marked`, back to
  Markdown with `turndown`) or a Markdown mode (textarea + live preview).
  Markdown stays the stored format. The editor is a lazy chunk so the main
  bundle doesn't carry the converters. Notes can be renamed from the note
  page's "…" menu. Edits keep the part's scores.

## Addendum 2026-10-05 — hints are silent and timed

- Hints are **not spoken** for now (user request): `SPEAK_HINTS = false` in
  `useRecitation.ts`; no `/speak` calls are made. `/speak` itself now sends
  only the words — the TTS model was reading the "Say slowly and clearly:"
  instruction aloud.
- A hint stays on screen for **3 s** (countdown ring on the bubble), then
  hides, regardless of whether she has started speaking. Saying past the
  hinted words still resets escalation to the concept cue.

## Addendum 2026-10-05 — cleaned-up notes; hints pause the silence clock

- **Notes are no longer strictly verbatim.** `/prepare` keeps all study
  content and stays close to the wording, but fixes typos, removes clutter
  (citation/reference markers, URLs, figure pointers, page numbers, stray
  symbols) and may lightly smooth a phrase for readability. Medical terms,
  drugs, doses and abbreviations stay as written. The fidelity check is now
  a "content dropped?" guard: retry/warn below 0.7 (was 0.97 word-for-word).
- **Silence only counts with a clear screen.** While a hint is on screen or
  a hint is being fetched (auto or Hint button), the pause detector is
  paused; the quiet clock restarts when the hint hides. So a manual hint is
  never followed by an overlapping auto hint, and the next auto hint comes
  3 s after the bubble clears.

## Addendum 2026-10-05 — score ideas, not words

Supersedes **Score** above, at the user's request. `/score` now asks
Gemini to split the part into its ideas (fact, definition, list, step,
relationship — covering every word once), score each 0-100 for how
completely she conveyed it in any wording, and list the passage words for
the specific details she left out or got wrong (e.g. "B" when the note says
"A, B and C" and she said A and C; a 0-score idea is missed whole). Hinted
words are sent along and earn no credit. Percent = idea scores weighted by
idea length (`gradeIdeas` in `api/text.js`, unit-tested). Mispronounced key
terms come back as `unclear` ("Say it clearer"). The on-device word match is
now only the offline fallback. Label: "N% of the ideas".
