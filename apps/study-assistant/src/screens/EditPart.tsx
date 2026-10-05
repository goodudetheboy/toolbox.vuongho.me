import { useEffect, useRef, useState } from 'react';
import Markdown from '../components/Markdown';
import { Paper } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { notesStore } from '../lib/notes';
import { htmlToMarkdown, markdownToHtml } from '../lib/richText';
import type { AppUser, Note } from '../lib/types';
import { t } from '../strings';

// Edit one part: its title and its text, either as rich text (a contenteditable
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

export default function EditPart({
  user,
  note,
  index,
  onDone,
}: {
  user: AppUser;
  note: Note;
  index: number;
  onDone: () => void;
}) {
  const chunk = note.chunks[index];
  const [title, setTitle] = useState(chunk.title);
  const [mode, setMode] = useState<Mode>(savedMode);
  const [markdown, setMarkdown] = useState(chunk.markdown);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const richRef = useRef<HTMLDivElement>(null);

  // Fill the rich editor whenever it's (re)shown; it's uncontrolled while she types.
  useEffect(() => {
    if (mode === 'rich' && richRef.current) richRef.current.innerHTML = markdownToHtml(markdown);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await notesStore.updateChunk(user.uid, note, index, { title: title.trim() || chunk.title, markdown: md });
      onDone();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <main className="screen edit-screen">
      <TopBar onBack={onDone} title={<span className="hand title-ellipsis">{t.editPart(index + 1)}</span>} />

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
        onChange={(e) => setTitle(e.target.value)}
      />

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
          </div>
          <div ref={richRef} className="md rich-editor" contentEditable suppressContentEditableWarning />
        </Paper>
      ) : (
        <>
          <Paper className="edit-card">
            <textarea
              className="md-editor"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              spellCheck={false}
              rows={Math.max(8, markdown.split('\n').length + 2)}
            />
          </Paper>
          <p className="field-label">{t.preview}</p>
          <Paper className="edit-card preview-card">
            <Markdown text={markdown} />
          </Paper>
        </>
      )}

      {failed && <p className="error-text">{t.error}</p>}

      <div className="bottom-action two">
        <button className="btn" onClick={onDone}>
          {t.cancel}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? t.saving : t.save}
        </button>
      </div>
    </main>
  );
}
