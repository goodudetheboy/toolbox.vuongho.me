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
in SVG as a die-cut sticker in eight moods. *(Now illustrations — see addendum "Biggu illustrations".)* Progressive disclosure: each
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

## Addendum 2026-10-05 — every word colored, hint limit, score history

- Result: every word gets a color — Got it / Hinted / Missed. The "Say it
  clearer" (mispronounced) category is gone (`/score` no longer asks for
  it).
- Hint limit per recitation: 3 / 5 / 10 / 20 / ∞, default 5 (was 10 until 2026-10-06), picked on the
  read screen and kept per device (localStorage, `src/lib/settings.ts`). The
  Hint button shows how many are left; at 0 both auto and manual hints stop.
  Hints stay on screen 5 s (was 3 s).
- Each finished recitation is recorded on the note as
  `history: [{ at, part, percent, hints }]` (Firestore `arrayUnion`, same
  write as the part's last/best score). The note page shows a Progress list,
  newest first, with ▲/▼ versus that part's previous try. The result shows
  how many hints were taken.

## Addendum 2026-10-05 — score history per part, with each try's words

Supersedes the note-level history in the previous addendum, at the user's
request.

- Attempts now live on the part: `chunks[i].history: [{ at, percent, hints,
  marks, textHash }]`, written in the same `chunks` update as last/best
  score (no `arrayUnion` — the whole `chunks` array is rewritten anyway).
  Old `note.history` entries are left in place and read as a fallback
  (`chunkHistory` in `src/lib/notes.ts`); a part's first new attempt copies
  them onto the chunk.
- The Progress list moved from the note page to the part's read screen.
  Tapping a row opens that try's colored text (Got it / Hinted / Missed) so
  she can see what to go back over.
- To keep the note document small (1 MB Firestore limit) an attempt stores
  only `marks` — one letter per recitable word (`s`/`h`/`m`,
  `src/lib/marks.ts`) — plus an 8-char hash of the part's Markdown, not a
  copy of the text. The words are re-derived from the current part; if the
  part was edited since that try the hash no longer matches and the row says
  so instead of showing misaligned colors. Attempts from before marks
  existed show the score but don't open.

## Addendum 2026-10-05 — attempts as their own documents; Progress screen; offline cache

Supersedes the storage half of "score history per part" above. History
inside the note document grew without bound, and every write to a note
re-sends the whole document to every listener (the home list listens to
all notes) — bad on mobile data.

- Each attempt is its own document:
  `users/{uid}/notes/{noteId}/parts/{part}/attempts/{id}` =
  `{ at, percent, hints, marks?, textHash? }`. The note keeps only
  `lastScore`, `bestScore` and a `tries` count per chunk. Recording a try is
  one batch (attempt doc + chunk scores). Per-part subcollection so the
  query is a plain `orderBy('at','desc')` — no composite index to deploy.
- Progress is its own screen (`/n/:id/:part/progress`, button with the try
  count in the read card's header), paginated 10 per page with Newer/Older
  using a `startAfter(at)` cursor; each fetch asks for 11 so the last row's
  ▲/▼ and "is there an older page" come free. Loaded pages are kept in
  memory, so paging back re-downloads nothing.
- Old `note.history` / `chunk.history` are moved into attempt docs once
  (App effect → `migrateLegacyHistory`, ids `legacy-<at>` so it's
  idempotent), atomically with deleting the old fields.
- Deleting a note deletes its attempts first (Firestore doesn't cascade).
- Rules: the note match became `/users/{uid}/notes/{noteId}/{path=**}`.
- Firestore persistent local cache (IndexedDB, multi-tab): reopening the
  app reads from the device and the listener resumes with a token, so
  only changed notes are re-downloaded.

## Addendum 2026-10-05 — installable PWA

- `vite-plugin-pwa` (generateSW). Manifest `id`/`scope`/`start_url` are all
  `/study-assistant/`, and the worker is served from `/study-assistant/sw.js`,
  so installing gives just this tool — the toolbox homepage and other tools
  stay outside its scope (homepage has no manifest; checked in Chrome:
  `no-manifest` there, no installability errors here).
- Precaches the whole build (~1.9 MB raw, ~0.4 MB over the wire, once),
  lazy chunks included. Tried leaving the Word importer (mammoth) out via a
  named manual chunk: Rollup moved shared CommonJS helpers into it and made
  every page load fetch it, so reverted. Google Fonts are runtime-cached.
  Deep links fall back to the cached `index.html` (works offline).
- Updates: `registerType: 'prompt'` + `clientsClaim`, no auto skipWaiting —
  a new version waits until she taps Update in `UpdateToast`, so a deploy
  never reloads mid-recitation. Checks for updates hourly and when the app
  comes back to the foreground. The Update button reloads on
  `controllerchange` itself: workbox-window only reloads when a worker
  already controlled the page at registration, which isn't true in the
  first session after install.
- `useRegisterSW({ immediate: true })`: without it registration waits for
  window `load`, which has already fired by the time React mounts.
- Icons generated from `public/favicon.svg` *(since replaced, see "Biggu illustrations")* on the app's sky blue (192, 512,
  maskable 512 with the cat inside the safe zone, 180 apple-touch-icon).
- Hosting's `no-cache` on `/study-assistant/**` stays: it also keeps
  `sw.js` itself from being cached, which update checks rely on.

## Addendum 2026-10-05 — session feedback for later tuning

- Result screen asks "How was this session?" 👍 / 👎. 👍 saves at once; 👎
  asks what felt off (score / didn't hear me right / hints / other, multi)
  plus an optional note. Changing the rating overwrites the same record.
- Stored at `users/{uid}/feedback/{attemptId}` — outside the note so it
  outlives edits and deletion — and only for rated sessions. Each record is
  self-contained training material (`FeedbackRecord`, `schema: 1`, in
  `src/lib/feedback.ts`): part Markdown + its word list, transcript, every
  hint (text, word indices, ms since start, manual vs auto), hint limit,
  percent, per-word marks, Gemini's idea split and per-idea scores,
  `gradedBy` (gemini / offline fallback), model ids (transcribe + grade),
  duration.
- `/score` now also returns `ideas` (sanitized, `sanitizeIdeas`) and
  `model`; the client ignores them except for feedback. The attempt and
  its feedback share a client-generated id (`crypto.randomUUID()`).
- Not stored: audio. Only the transcript.
- *2026-10-06:* admin viewer at `/study-assistant/admin` (lazy `screens/Admin.tsx`,
  linked from Home only for `ADMIN_EMAIL`). Reads every `users/*/feedback`
  via a collection-group query; `firestore.rules` grants that read to
  hochivuong2002@gmail.com only (`match /{path=**}/feedback/{id}`). Sorted
  client-side so no collection-group index is needed. New records also store
  the rater's `email`. A "Download JSONL" button exports the filtered set for tuning.
- *2026-10-07:* the admin page has tabs: Feedback (`/admin`) and Usage
  (`/admin/usage`, `lib/usage.ts`). Usage comes from data the app already
  stores (collection-group reads of `notes` and `attempts`, admin-only in
  the rules) plus one new doc per user, `users/{uid}` = `{ email, name,
  lastSeenAt, opens }`. The app writes it on every load (merge, `opens` uses
  `increment`). It shows sessions in the last 7 and 30 days, active days,
  average score, a sessions-per-day bar chart, a per-person table and the
  most practiced parts, with a filter for each person. Gemini/API call counts
  aren't included because they only exist in the Cloud Run logs.

## Addendum 2026-10-05 — Biggu illustrations (supersedes "in SVG" above)

Biggu now looks like the real Biggu (a brown-grey mackerel tabby, from a
photo). He's drawn as colored-pencil paper cutouts with a white hand-cut
border, collage-style: semi-realistic but clearly drawn.

- One Gemini-generated image per mood (`gemini-3-pro-image`), each made
  from the photo plus one approved style reference so the set stays
  consistent. `src/assets/biggu/*.webp`: 400 px for the moods, 160 px for
  the heads (happy/sad feedback faces; `heads/*.webp` — calm, wink, blep,
  tilt, content, smug, excited — one picked at random per visit for the
  Home header, `RandomBigguHead`). `Biggu` and `BigguFace` keep their props
  and just render an `<img>`. Props and decorations (book, lightbulb,
  hearts, Zs, thought bubble) are baked into the image, so the CSS-animated
  listen waves are gone.
- Gemini can't output transparency, so each image is drawn on flat
  chroma-key green and keyed out (`art/process.py`). The sticker shadow is
  a CSS `drop-shadow` on `.biggu`.
- App icons (PWA 192/512/maskable, apple-touch, favicon) use the same head
  on the app's sky blue. `favicon.svg` is replaced by `favicon.png`.
- Reproducible: `art/generate.sh [mood…]` holds the prompts, references and
  processing. Review the output by eye before committing: generations vary.
- Cost: about 300 KB of images, precached by the service worker (`webp`
  added to the glob), where the SVGs were close to free.

## Addendum 2026-10-07 — exams and cram sheets

An **exam** is a name, a date and the notes it covers (whole notes or picked
parts), at `users/{uid}/exams/{id}`. Opening it shows a **cram sheet**: the
most useful passages to read just before the exam, in the note's own words.

- **Gemini tags, code ranks.** A new `/tag` endpoint splits each part into
  ideas (word ranges into `tokenize(markdown)`, the same words attempt
  marks use) and rates each idea's importance: 3 core, 2 supporting,
  1 filler. `sanitizeTags` makes the ranges cover every word exactly once.
  The ranking against her grades is plain code (`src/lib/cram.ts`, unit-tested):
  `relevance = importance × weakness`, where weakness is each try's miss
  rate (a hinted word counts half), weighted 0.7× per older try over the
  last 10 tries of the current text, smoothed with two pretend 50% tries
  (never tried = 0.5). The same inputs always give the same order; ties
  keep exam order. "Most important" sorts by importance alone.
- **Tags are stored beside the part, not on the note:**
  `users/{uid}/notes/{noteId}/parts/{part}` = `{ ideas, ideasHash, model }`.
  Writing them never rewrites the note document, so they can't race score
  updates, and Home's listener never downloads them. `ideasHash` is
  `textHash` of the markdown that was *sent*, so an edit made while a
  request is in flight still counts as stale.
- **When tagging happens:** in the background after a note is created and
  after a part is saved. As a safety net, the cram sheet re-tags any part
  whose hash doesn't match (existing notes, edits, failed calls). It sends
  20 parts per request, 3 requests at a time, so long notes stay quick. Any
  part left untagged falls back to one idea per line at importance 2,
  unsaved, so the sheet always works and tries Gemini again next time. That
  covers: Gemini down, a failed batch, a part Gemini skipped (the API
  returns `null` for it, never a made-up filler idea), and a part over the
  API's 2,000-word limit.
  *Deviation from the original plan:* tagging was going to ride along in
  `/prepare`'s response. It's a separate call because the word indices must
  come from the app's own tokenizer.
- **No stored sheet and no length setting.** The sheet is rebuilt from tags
  and tries each time it opens. It shows about 5 minutes (≈1000 words) at a
  time; "I have more time, give meow more!" adds the next 5 minutes of the
  same ranked list. The ranking is frozen while the sheet is open: only a
  change to which text is on the exam rebuilds it. Popping into a part (the book
  button) and back keeps the sheet exactly as she left it: the list, the
  loads, the filter, the encouragement notes and the scroll position all
  come from an in-memory cache (`lib/cramCache.ts`), with no rebuild.
  Opening the exam from the Exams tab clears the cache and builds fresh,
  so new tries count.
- **"I remember this" ticks are device-local** (`localStorage`, per exam,
  keyed with the part's text hash). They fade the passage but don't skip,
  reorder or sync anything.
  The sheet's ⋯ menu has "Uncheck all" (shown only while something on the
  sheet is checked), which clears them for that exam.
- **Note filter:** a filter icon beside the sort toggle (only for exams
  with more than one note) opens a dialog of the exam's notes with
  tick-boxes, so she can show any mix. At least one note always stays
  ticked, and "Show all" resets it. The ranking is the same, filtered, and
  a change starts again at the first 5 minutes. A coral dot on the icon
  means some notes are hidden. The filter isn't saved: each visit starts
  with every note. With more than 5 notes, the dialog also has a search
  box (title or subject). It only narrows the list; ticks on notes it hides
  are kept. This replaced a row of chips the user didn't want on
  the sheet.
- **UI:** Home gets "My notes | Exams" tabs, and the last-used tab is
  remembered. Exams are calendar polaroids. The exam form has a note
  search, and its parts count opens a per-part picker. The note page's ⋯
  menu has "Add to exam". The cram sheet's ⋯ has Edit / Delete exam.
  Cram cards show only the passage. The "I remember this" check and a
  quiet book icon (opens that part; its name is the tooltip and label)
  sit stacked on the right. No "Note · Part n" header: the user found it
  cluttered. Opening a part from a card goes to `/n/{id}/{n}?hl=start-end`,
  and the part's reading card marks those words in pink and scrolls them
  into view (`src/lib/highlight.ts`). It uses the CSS Custom Highlight API,
  so React's DOM is never touched. The rendered text is walked the same
  way `tokenize` splits words. If the word count doesn't match, nothing is
  marked rather than the wrong words; older browsers just show no
  highlight.
  Everything reuses the part screen's pieces (taped `Paper`, `.md` text
  with bold highlighted, Biggu beside the big button).
- **Encouragement notes** (`src/lib/cheer.ts`, unit-tested): small taped
  notes between cram-sheet cards, each with a random Biggu head and a line
  from `t.cheers`. Placement uses a seed picked when the sheet opens: at
  least 5 cards apart, a 25% chance at each eligible gap. Each note depends
  only on the seed and its card position, so it never moves when more
  cards load or the sort changes. On tling241004@gmail.com, a visit has a
  10% chance that its first note is signed by Vpork ("I love you ❤️ you
  can do it - Vpork"), with Vpork's face drawn in Biggu's style
  (`src/assets/vpork.webp`, made with `art/generate.sh vpork`; the source
  selfie isn't committed, so pass it as `VPORK_PHOTO`).

## Addendum 2026-10-07 — deleting a part *(storage superseded by "part ids" below)*

A part's ⋯ menu has "Delete this part" (hidden when it's the note's only
part; "Delete this note" covers that). Attempts and exam tags are stored
by part number (`parts/{n}/…`), so deleting part *i* removes its data and
moves every later part's attempts and tag doc down one (copy + delete,
batched). Exams that picked specific parts are renumbered, and an exam
left with no parts of the note drops it. The note document is updated
first, so the UI is right at once. If the move is interrupted, the worst
case is a later part showing a neighbour's old tries. Those tries' text
hashes won't match, so their colored words and cram ranking ignore them.
Old feedback records keep their old part number; they're self-contained.

## Addendum 2026-10-07 — part ids

Parts are identified by a permanent `Chunk.id`, not by their position.
Tries live at `parts/{partId}/attempts`, exam tags at `parts/{partId}`,
and exam picks, cram-sheet tick keys and feedback records (`partId`) all
use the id. Deleting a part removes it and its own data, and nothing else
moves. Reordering, splitting or merging parts later needs no data
migration. URLs keep the position (`/n/{id}/2`); that's only for display.

- **Migration costs nothing.** Parts saved before ids existed have no `id`.
  `partId(note, i)` falls back to `String(i)`, which is exactly where their
  data already lives. Every write of a note's chunks array fills those ids
  in (`withIds`) before positions can change, and deleting a part does that
  first. Exams saved earlier hold positions as numbers. `pickedIds` reads
  them as strings, which equal the fallback ids.
- New parts get random 8-character ids, set in NewNote so the background
  tagging can use them right away.
- The "shift later parts down" code from the delete-a-part addendum is gone.

## Addendum 2026-10-07 — tap to pet

Tapping Biggu purrs: the Home header head, the corner Biggu on the part
and cram-sheet screens, the cheering Biggu at the end of a cram sheet, and
the heads on encouragement notes (`components/Pettable.tsx`,
`lib/purr.ts`). While he purrs, a head swaps to the eyes-closed
"content" face and full-body Biggu to "proud", with a small wiggle (off
under reduced motion).

- Sound only on a tap, never automatic, because she may be in a library or class.
  A tap during a purr does nothing, so purrs never stack.
- The mic must never hear it: the part screen stops any purr the moment
  recitation starts.
- `src/assets/purr.m4a`: 10 s cut from the user's 48 s phone recording of
  Biggu (19–29 s, the longest stretch clear of handling bumps; the user
  found the first 4 s cut too short). It's high-passed at 80 Hz, since its
  energy is 60–400 Hz and phones can't play the rumble. A slow 1 s leveler
  (±9 dB) evens out its swell, then it's normalized to −3 dBFS peak with
  0.6 s / 1.5 s fades. AAC 64 kb/s mono for iOS, 83 KB, and precached for
  offline. The source recording isn't committed.

## Addendum 2026-10-07 — managing access from the admin page

Who can sign in used to be a hard-coded list in `firestore.rules` and the
API's `ALLOWED_EMAILS`, so adding someone took a code change and a deploy.
Now:

- **Built-in:** hochivuong2002@gmail.com and tling241004@gmail.com stay
  hard-coded in both places and are always allowed, so the admin can't lock
  anyone (or themselves) out.
- **Added:** the admin page's Access tab (`/admin/access`,
  `screens/AdminAccess.tsx`, `lib/access.ts`) adds and removes emails in
  Firestore `config/access { emails, updatedAt, updatedBy }`. Only the
  admin can read or write that document.
- `firestore.rules` `allowed()` = built-in, or `exists` + `get()` of
  `config/access` with the email in it. The `get()` is only evaluated for
  non-built-in users.
- The API allows `ALLOWED_EMAILS` plus `config/access`, read through
  firebase-admin and cached for 60 s (on a failed read the last good list
  stays). So a newly added person can open the app at once, and practice
  (hints, grading) starts working within a minute. The Cloud Run service
  account already has Editor, which covers the read.
- Removing an email blocks sign-in. Their notes stay in Firestore.

## Addendum 2026-10-07 — account menu and general feedback

Home's top right shows her Google display name and a person button with a menu:
Send feedback, Admin (admin only) and Sign out (`components/AccountMenu.tsx`).
"Send feedback" (`/feedback`, `screens/SendFeedback.tsx`) sends a kind
(idea / something's wrong / other) and text, plus her browser's user agent
to help reproduce problems, to `users/{uid}/messages/{id}`
(`lib/messages.ts`). She can create and read her own messages; the admin
reads all of them through a collection-group rule. The admin page gets a
Messages tab, and the old "Feedback" tab (session ratings) is now labelled
"Ratings".

## Addendum 2026-10-07 — "How it works" cards

Five swipeable taped cards (`components/GuideCards.tsx`): add a note, recite,
pause for a hint, colors and scores, exam cram sheets. Each card has one idea.
Its picture is a scrapbook collage (`src/assets/guide/`, made with Gemini by
`art/guide.sh` from the Biggu style references plus a screenshot of the real
screen): a hand-drawn phone showing that screen, with **Biggu as the student**
holding it, reciting to it and tapping Hint. There are no people in them: a
drawn girl came out as a different person in every image, and the user chose
Biggu instead. The words sit on a crooked lined-paper scrap with a numbered
sticker; key words get the notes' yellow highlighter, and the colors card uses
the result screen's green, yellow and red. Tapping the last picture makes Biggu
purr. On short phones the picture shrinks so Skip / Next stay on screen. Swiping is native
horizontal scroll-snap, with dots and Previous / Next below (Previous replaced Skip on 2026-10-07 at the user's request). We chose this over a
help page (long text isn't read on a phone) and over a tooltip tour of the real
screens (it breaks whenever the layout changes). They show up in three places:

- **First sign-in:** the cards are shown once, full screen, with an X at the
  top right to close them. If she has no notes yet, the last button is "Add
  your first note".
- **No notes yet:** Home's empty state is Biggu with "Add your first note" and
  a "How it works" button under it.
- **Any time:** "How it works" in the account menu (`/how-it-works`, also
  with the X).

"Seen" is `guideSeen: true` on her profile (`users/{uid}`, which the existing
rule already lets her write), with a localStorage copy so it's known
instantly. If the profile can't be read, it counts as seen, so the cards
don't come back on every launch. Existing users who haven't seen them get
them once.

## Addendum 2026-10-07 — Biggu's chin and throat

The real Biggu has a white chin with only a light peachy-orange tint on the
throat below it. He has no white bib, but every illustration had one, because
the style reference did. Instead of redrawing everything, each existing sticker
and head, the app icon's head, and `art/style-ref.png` itself were sent to
Gemini as an image edit ("change only the throat; keep everything else") with
the user's photo `art/biggu-photo-2.jpg` (`art/fix-throat.sh`, with
`fix_prep.py` / `fix_post.py`). That kept the poses and faces exactly.
`generate.sh`'s description of him is corrected too, so future drawings start
right.
