import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import Markdown from '../components/Markdown';
import PartTitle from '../components/PartTitle';
import { Icon, Paper } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { IMAGE_ACCEPT, isImageFile } from '../lib/decodeImage';
import { deleteImages, imageIds, imageMarkdown, prepareImage, resolveImagesIn, saveImages } from '../lib/images';
import { insertChunk, notesStore, partId } from '../lib/notes';
import { textHash } from '../lib/marks';
import { tagInBackground } from '../lib/tags';
import { htmlToMarkdown, markdownToHtml } from '../lib/richText';
import type { AppUser, Note } from '../lib/types';
import { t } from '../strings';

// Edit one part (or write a new one, put at position `at`): its title and its text, either as rich text (a contenteditable
// view of the Markdown) or as raw Markdown with a live preview. Markdown is what's
// stored; the rich view converts back on switching mode or saving.

type Mode = 'rich' | 'markdown';
const MODE_KEY = 'study-assistant:edit-mode';

function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'rich';
  } catch {
    return 'rich';
  }
}

/** Two lines of the top-bar title at its smaller size (see PartTitle). */
const TITLE_MAX = 50;

const TOOLS: { label: string; title: string; run: () => void }[] = [
  { label: 'B', title: 'Bold', run: () => toggleInline('STRONG') },
  { label: 'I', title: 'Italic', run: () => toggleInline('EM') },
  { label: 'H', title: 'Heading', run: () => toggleBlock('H3') },
  { label: '•', title: 'Bullet list', run: () => document.execCommand('insertUnorderedList') },
  { label: '1.', title: 'Numbered list', run: () => document.execCommand('insertOrderedList') },
];

function selectedElement(): Element | null | undefined {
  const node = window.getSelection()?.anchorNode;
  return node instanceof Element ? node : node?.parentElement;
}

function toggleBlock(tag: string) {
  document.execCommand('formatBlock', false, selectedElement()?.closest(tag) ? 'P' : tag);
}

/**
 * Bold/italic by wrapping in <strong>/<em> directly: execCommand('bold') reads the
 * editor's heavy base font weight as "already bold" and un-bolds instead.
 */
function toggleInline(tag: 'STRONG' | 'EM') {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const inside = selectedElement()?.closest(tag === 'STRONG' ? 'strong, b' : 'em, i');
  if (inside?.closest('.rich-editor')) {
    inside.replaceWith(...inside.childNodes);
    return;
  }
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const el = document.createElement(tag);
  el.appendChild(range.extractContents());
  range.insertNode(el);
  sel.removeAllRanges();
  const after = document.createRange();
  after.selectNodeContents(el);
  sel.addRange(after);
}

/** A collapsed range at a screen point (where a dragged file is dropped). */
function caretAt(x: number, y: number): Range | null {
  const pos = document.caretPositionFromPoint?.(x, y);
  if (pos) {
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return document.caretRangeFromPoint?.(x, y) ?? null; // Safari
}

export default function EditPart({
  user,
  note,
  index,
  at,
  onDone,
}: {
  user: AppUser;
  note: Note;
  /** The part to edit; leave out to add a new part. */
  index?: number;
  /** Where a new part goes (0 = first). */
  at?: number;
  onDone: () => void;
}) {
  const isNew = index === undefined;
  const chunk = isNew ? { title: '', markdown: '' } : note.chunks[index];
  const [place, setPlace] = useState(() => Math.max(0, Math.min(at ?? note.chunks.length, note.chunks.length)));
  const [title, setTitle] = useState(chunk.title);
  const [mode, setMode] = useState<Mode>(savedMode);
  const [markdown, setMarkdown] = useState(chunk.markdown);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [addingImage, setAddingImage] = useState(false);
  const richRef = useRef<HTMLDivElement>(null);
  const mdRef = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  /** Where the caret was in the rich editor before the picture picker took focus. */
  const savedRange = useRef<Range | null>(null);

  // Fill the rich editor whenever it's (re)shown; it's uncontrolled while she types.
  useEffect(() => {
    if (mode === 'rich' && richRef.current) {
      richRef.current.innerHTML = markdownToHtml(markdown);
      void resolveImagesIn(richRef.current, user.uid, note.id);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function rememberCaret() {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    savedRange.current = range && richRef.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  /** Shrinks the pictures and drops them in where the caret is. Stored on save. */
  async function addImages(files: File[]) {
    const images = files.filter(isImageFile);
    if (!images.length) return;
    setAddingImage(true);
    try {
      for (const file of images) {
        const { id, dataUrl } = await prepareImage(file);
        if (mode === 'rich' && richRef.current) {
          const editor = richRef.current;
          const img = document.createElement('img');
          img.src = dataUrl;
          img.dataset.img = id;
          let range = savedRange.current;
          if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
          }
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          savedRange.current = range;
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        } else {
          const area = mdRef.current;
          const at = area?.selectionStart ?? markdown.length;
          const end = area?.selectionEnd ?? at;
          setMarkdown((m) => `${m.slice(0, at)}\n\n${imageMarkdown(id)}\n\n${m.slice(end)}`.replace(/^\n+/, ''));
        }
      }
    } catch {
      setFailed(true);
    } finally {
      setAddingImage(false);
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = [...e.clipboardData.files].filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    if (mode === 'rich') rememberCaret();
    void addImages(files);
  }

  // Dragging picture files in, like GitHub: the editor lights up, and they land where they're dropped.
  const [dropping, setDropping] = useState(false);
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return; // dragging text around stays the browser's own
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(false);
      const files = [...e.dataTransfer.files].filter(isImageFile);
      if (!files.length) return;
      if (mode === 'rich') savedRange.current = caretAt(e.clientX, e.clientY);
      void addImages(files);
    },
  };

  const currentMarkdown = () => (mode === 'rich' && richRef.current ? htmlToMarkdown(richRef.current.innerHTML) : markdown);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMarkdown(currentMarkdown());
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // just a preference
    }
  }

  async function save() {
    const md = currentMarkdown().trim();
    if (!md) return;
    setSaving(true);
    setFailed(false);
    try {
      const ids = imageIds(md);
      await saveImages(user.uid, note.id, ids);
      const gone = imageIds(chunk.markdown).filter((id) => !ids.includes(id));
      if (gone.length) void deleteImages(user.uid, note.id, gone).catch(() => {});
      if (isNew) {
        const id = await insertChunk(user.uid, note, place, { title: title.trim() || t.part(place + 1, note.chunks.length + 1), markdown: md });
        tagInBackground(user.uid, [{ noteId: note.id, partId: id, markdown: md }]);
        onDone();
        return;
      }
      await notesStore.updateChunk(user.uid, note, index, { title: title.trim() || chunk.title, markdown: md });
      // Re-tag for exam cram sheets; if this fails the sheet re-tags it when it next opens.
      if (textHash(md) !== textHash(chunk.markdown)) tagInBackground(user.uid, [{ noteId: note.id, partId: partId(note, index), markdown: md }]);
      onDone();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <main className="screen edit-screen">
      <TopBar
        onBack={onDone}
        title={isNew ? <PartTitle title={t.newPart} pill={t.afterPill(place)} /> : <span className="hand title-ellipsis">{t.editPart(index + 1)}</span>}
      />

      <label className="field-label field-label-row" htmlFor="part-title">
        {t.partTitle}
        {title.length >= TITLE_MAX - 10 && (
          <span className={`char-count ${title.length >= TITLE_MAX ? 'full' : ''}`}>
            {title.length}/{TITLE_MAX}
          </span>
        )}
      </label>
      <input
        id="part-title"
        className="text-input"
        value={title}
        maxLength={TITLE_MAX}
        placeholder={isNew ? t.newPartTitle : undefined}
        onChange={(e) => setTitle(e.target.value)}
      />

      {isNew && note.chunks.length > 0 && (
        <>
          <label className="field-label" htmlFor="part-place">
            {t.putIt}
          </label>
          <select id="part-place" className="text-input place-select" value={place} onChange={(e) => setPlace(Number(e.target.value))}>
            <option value={0}>{t.atStart}</option>
            {note.chunks.map((c, i) =>
              i === note.chunks.length - 1 ? (
                <option key={i} value={i + 1}>
                  {t.atEnd}
                </option>
              ) : (
                <option key={i} value={i + 1}>
                  {t.afterPart(i + 1, c.title)}
                </option>
              ),
            )}
          </select>
        </>
      )}

      <div className="seg" role="tablist">
        {(['rich', 'markdown'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => switchMode(m)}>
            {m === 'rich' ? t.richText : t.markdown}
          </button>
        ))}
      </div>

      {mode === 'rich' ? (
        <Paper className="edit-card">
          <div className="rich-toolbar">
            {TOOLS.map((tool) => (
              <button
                key={tool.title}
                type="button"
                title={tool.title}
                aria-label={tool.title}
                // Keep the text selection: act on mousedown and don't let the button take focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  tool.run();
                }}
              >
                {tool.label}
              </button>
            ))}
            <button
              type="button"
              className="rich-image"
              title={t.addPicture}
              aria-label={t.addPicture}
              onMouseDown={(e) => {
                e.preventDefault();
                rememberCaret();
              }}
              onClick={() => imageInput.current?.click()}
              disabled={addingImage}
            >
              <Icon name="image" size={22} />
            </button>
          </div>
          <div ref={richRef} className={`md rich-editor ${dropping ? 'dropping' : ''}`} onPaste={onPaste} {...dropProps} data-placeholder={isNew ? t.newPartPlaceholder : undefined} contentEditable suppressContentEditableWarning />
        </Paper>
      ) : (
        <>
          <Paper className="edit-card">
            <textarea
              ref={mdRef}
              onPaste={onPaste}
              {...dropProps}
              className={`md-editor ${dropping ? 'dropping' : ''}`}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              spellCheck={false}
              placeholder={isNew ? t.newPartPlaceholder : undefined}
              rows={Math.max(8, markdown.split('\n').length + 2)}
            />
          </Paper>
          <p className="field-label">{t.preview}</p>
          <Paper className="edit-card preview-card">
            <Markdown text={markdown} />
          </Paper>
        </>
      )}

      <input
        ref={imageInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void addImages([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {mode === 'markdown' && (
        <button type="button" className="text-btn add-picture" onClick={() => imageInput.current?.click()} disabled={addingImage}>
          <Icon name="image" size={20} /> {t.addPicture}
        </button>
      )}
      {addingImage && <p className="muted adding-picture">{t.addingPicture}</p>}
      {failed && <p className="error-text">{t.error}</p>}

      <div className="bottom-action two">
        <button className="btn" onClick={onDone}>
          {t.cancel}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving || addingImage}>
          {saving ? t.saving : isNew ? t.addPart : t.save}
        </button>
      </div>
    </main>
  );
}
