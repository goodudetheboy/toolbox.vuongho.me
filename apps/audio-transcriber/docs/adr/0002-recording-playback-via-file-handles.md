# 0002. Recording playback: persist file handles, not media

Status: Accepted

## Context

Transcript rows get a play button that seeks the original recording to that
segment's timestamp, so a transcript can be checked against the audio. That
works easily while the file is still in the queue (it's already a `File` in
memory). For transcripts reopened from History, the recording has to come
from somewhere. The options:

1. **Store the media bytes in IndexedDB/OPFS.** Always works, but history
   gets huge (recordings are often hundreds of MB), and storage quota and
   eviction become a problem.
2. **Store the file path.** Browsers never expose real file paths, so this
   isn't possible.
3. **Store a File System Access `FileSystemFileHandle`.** This is a small,
   structured-cloneable pointer to the file on disk. Chromium can put it in
   IndexedDB and reopen the file later. Reading it after a reload needs
   permission again: `queryPermission`/`requestPermission`, and requesting
   needs a click. Chromium-only: Firefox and Safari don't have
   `showOpenFilePicker` or `getAsFileSystemHandle`.
4. **Ask the user to re-attach the file** each time. Works everywhere, but
   adds a step every time.

## Decision

Use 3, with 4 as the fallback:

- Files picked with `showOpenFilePicker` or dropped (via
  `DataTransferItem.getAsFileSystemHandle()`) keep their handle. When the
  first chunk is saved, the handle goes into a separate `mediaHandles`
  object store (DB version 2) keyed by transcript id. The bytes are never
  stored.
- When a history transcript is opened, the app looks up its handle. If
  permission is still granted, it loads with no click. Otherwise it shows a
  **Reopen** button (the permission prompt needs a user click). If the file
  has moved or been deleted, it shows an error and offers **Attach file…**.
- In any browser, **Attach file…** lets the user pick the recording by
  hand. If the pick came with a handle, that handle is saved for next time.
- Deleting a transcript deletes its handle in the same transaction.

## Consequences

- History stays small. Playback from history on Chromium usually takes zero
  or one click.
- On Firefox and Safari, playback from history always needs a manual
  re-attach. In-session playback works everywhere.
- A handle points at a file's location. If the file is moved or renamed,
  the handle fails and the user re-attaches. Nothing checks that an
  attached file is the same recording that was transcribed.
- Playback uses a plain `<audio>` element on the original file. Containers
  the browser can't decode natively (some MKV/AVI) show a "can't play this
  format" note. They are not transcoded through ffmpeg.wasm.
