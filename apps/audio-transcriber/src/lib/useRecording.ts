import { useCallback, useEffect, useState } from 'react';
import type { PickedFile } from '../types';
import { getMediaHandle, saveMediaHandle } from './storage';

/**
 * Where the active transcript's original recording stands:
 * - ready: we have the File and can play it
 * - locked: a handle is saved but the browser needs a click to re-grant access
 * - missing: nothing to play — the user can attach the file manually
 * - checking: looking up a saved handle
 */
export type RecordingState =
  | { kind: 'ready'; file: File }
  | { kind: 'locked'; filename: string }
  | { kind: 'missing'; error?: string }
  | { kind: 'checking' };

interface Lookup {
  id: string;
  handle?: FileSystemFileHandle;
  error?: string;
}

async function readHandle(handle: FileSystemFileHandle, prompt: boolean): Promise<File | null> {
  let perm = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
  if (perm === 'prompt' && prompt) perm = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
  if (perm !== 'granted') return null;
  return handle.getFile();
}

const MOVED_ERROR = "Couldn't open the original file — it may have been moved, renamed, or deleted.";

/**
 * Resolves the recording for a transcript: the queued File this session if it's
 * still in the queue, otherwise one reopened from a persisted File System Access
 * handle (history), otherwise one the user attaches by hand. Resolved Files are
 * cached per transcript id for the rest of the session.
 */
export function useRecording(transcriptId: string | undefined, queuedFile: File | undefined) {
  const [resolved, setResolved] = useState<Map<string, File>>(() => new Map());
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const remember = useCallback((id: string, file: File) => {
    setResolved(prev => new Map(prev).set(id, file));
  }, []);

  const cached = transcriptId ? resolved.get(transcriptId) : undefined;
  const needsLookup = !!transcriptId && !queuedFile && !cached;

  useEffect(() => {
    if (!needsLookup || !transcriptId) return;
    let cancelled = false;
    (async () => {
      const handle = await getMediaHandle(transcriptId).catch(() => undefined);
      if (cancelled) return;
      if (handle) {
        try {
          // Chromium may have kept the grant (or the user chose "allow on every
          // visit") — if so, load straight away with no extra click.
          const file = await readHandle(handle, false);
          if (cancelled) return;
          if (file) { remember(transcriptId, file); return; }
        } catch {
          if (!cancelled) setLookup({ id: transcriptId, error: MOVED_ERROR });
          return;
        }
      }
      setLookup({ id: transcriptId, handle });
    })();
    return () => { cancelled = true; };
  }, [needsLookup, transcriptId, remember]);

  let state: RecordingState | undefined;
  if (!transcriptId) state = undefined;
  else if (queuedFile) state = { kind: 'ready', file: queuedFile };
  else if (cached) state = { kind: 'ready', file: cached };
  else if (lookup?.id !== transcriptId) state = { kind: 'checking' };
  else if (lookup.handle) state = { kind: 'locked', filename: lookup.handle.name };
  else state = { kind: 'missing', error: lookup.error };

  const unlock = useCallback(async () => {
    if (!transcriptId || lookup?.id !== transcriptId || !lookup.handle) return;
    const id = transcriptId;
    try {
      const file = await readHandle(lookup.handle, true);
      if (file) remember(id, file);
      else setLookup({ id, handle: lookup.handle, error: 'Permission to read the file was denied.' });
    } catch {
      // Kept in storage (the drive may just be unplugged); attaching a file
      // overwrites it.
      setLookup({ id, error: MOVED_ERROR });
    }
  }, [transcriptId, lookup, remember]);

  const attach = useCallback(({ file, handle }: PickedFile) => {
    if (!transcriptId) return;
    remember(transcriptId, file);
    if (handle) saveMediaHandle(transcriptId, handle).catch(console.error);
  }, [transcriptId, remember]);

  const lockedError = state?.kind === 'locked' && lookup?.error ? lookup.error : undefined;

  return { state, lockedError, unlock, attach };
}
