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
