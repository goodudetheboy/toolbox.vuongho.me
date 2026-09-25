import type { PickedFile } from '../types';

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus'];
const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi'];

export const ACCEPT = ['video/*', 'audio/*', ...VIDEO_EXTS, ...AUDIO_EXTS].join(',');

function isMedia(file: File): boolean {
  return file.type.startsWith('video/') || file.type.startsWith('audio/') || file.size > 0;
}

function pickWithInput(multiple: boolean): Promise<PickedFile[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []).filter(isMedia).map(file => ({ file })));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/**
 * Opens a file picker for audio/video. Uses the File System Access API where
 * available so each result carries a handle that can be persisted and reopened
 * later; falls back to a plain <input type="file"> elsewhere (no handle).
 */
export async function pickMediaFiles(multiple: boolean): Promise<PickedFile[]> {
  if (!window.showOpenFilePicker) return pickWithInput(multiple);
  try {
    const handles = await window.showOpenFilePicker({
      multiple,
      types: [{
        description: 'Audio or video',
        accept: { 'audio/*': AUDIO_EXTS, 'video/*': VIDEO_EXTS },
      }],
    });
    const picked = await Promise.all(handles.map(async handle => ({ file: await handle.getFile(), handle })));
    return picked.filter(p => isMedia(p.file));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return [];
    // SecurityError in a cross-origin iframe etc. — fall back to the plain picker
    return pickWithInput(multiple);
  }
}

/**
 * Pulls files (and, on Chromium, their handles) out of a drop event. Must be
 * called synchronously inside the drop handler — the DataTransfer is emptied as
 * soon as the handler returns, so every getAsFileSystemHandle() call has to be
 * kicked off before the first await.
 */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(dt.items).filter(item => item.kind === 'file');
  const entries = items.map(item => ({
    file: item.getAsFile(),
    handle: item.getAsFileSystemHandle?.().catch(() => null) ?? Promise.resolve(null),
  }));
  const picked = await Promise.all(entries.map(async ({ file, handle }): Promise<PickedFile | null> => {
    if (!file) return null;
    const h = await handle;
    return { file, handle: h?.kind === 'file' ? (h as FileSystemFileHandle) : undefined };
  }));
  return picked.filter((p): p is PickedFile => p !== null && isMedia(p.file));
}
