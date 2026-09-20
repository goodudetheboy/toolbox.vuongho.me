import type { HistorySummary } from '../lib/history';

interface Props {
  entries: HistorySummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function HistoryPanel({ entries, onOpen, onDelete, onClear, onClose }: Props) {
  return (
    <div className="history-panel">
      <div className="history-header">
        <h2>History</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <p className="subtitle">
        Stored only on this device (IndexedDB) — never uploaded anywhere.
      </p>

      {entries.length === 0 && <p className="subtitle">No uploads yet.</p>}

      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="history-item">
            <button className="history-item-main" onClick={() => onOpen(entry.id)}>
              <span className="history-filename">{entry.filename}</span>
              <span className="history-meta">
                {entry.pageCount} page{entry.pageCount === 1 ? '' : 's'} ·{' '}
                {new Date(entry.uploadedAt).toLocaleString()}
              </span>
            </button>
            <button className="history-delete" onClick={() => onDelete(entry.id)} aria-label="Delete entry">
              Delete
            </button>
          </li>
        ))}
      </ul>

      {entries.length > 0 && (
        <button className="history-clear" onClick={onClear}>
          Clear all history
        </button>
      )}
    </div>
  );
}
