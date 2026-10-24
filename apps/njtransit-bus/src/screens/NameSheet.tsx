import { useState } from 'react';
import type { Bookmark } from '../lib/saved';

// Naming a bookmark: an optional name shown above the stop names on the board
// and in the saved list. Opened by the board's bookmark button or its title,
// and by the pencil in the saved list; renames or removes an existing one.
export default function NameSheet({
  bookmark,
  from,
  to,
  onSave,
  onRemove,
  onClose,
}: {
  bookmark: Bookmark | null;
  from: string;
  to: string;
  onSave: (title: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(bookmark?.title ?? '');
  return (
    <div className="stats" role="dialog" aria-label="Bookmark" onPointerUp={(e) => e.stopPropagation()}>
      <div className="stats-head">
        <div className="label">{bookmark ? 'BOOKMARK' : 'SAVE TRIP'}</div>
        <button className="flip" onClick={onClose} aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(title.trim().toUpperCase());
        }}
      >
        <div className="small">
          {from}
          <br />→ {to}
        </div>
        <div className="field">
          <label htmlFor="bookmark-title" className="small">
            NAME (OPTIONAL)
          </label>
          <input
            id="bookmark-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.G. TO WORK"
            maxLength={40}
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
          />
        </div>
        <div className="name-buttons">
          <button type="submit" className="stats-copy">
            SAVE
          </button>
          {bookmark && (
            <button type="button" className="stats-copy" onClick={onRemove}>
              REMOVE
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
