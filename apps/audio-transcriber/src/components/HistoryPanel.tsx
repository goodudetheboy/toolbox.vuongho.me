import type { TranscriptRecord } from '../types';
import { formatDate } from '../lib/formatters';

interface Props {
  history: TranscriptRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function HistoryPanel({ history, activeId, onSelect, onDelete, onClose }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="history-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>History</h2>
          <button className="btn-icon" onClick={onClose} title="Close">×</button>
        </div>
        <div className="drawer-body">
          {history.length === 0 ? (
            <div className="history-empty">No transcripts yet</div>
          ) : (
            history.map(r => (
              <div
                key={r.id}
                className={`history-item ${r.id === activeId ? 'active' : ''}`}
                onClick={() => onSelect(r.id)}
              >
                <span style={{ fontSize: 22 }}>📄</span>
                <div className="history-item-info">
                  <div className="history-item-name" title={r.filename}>{r.filename}</div>
                  <div className="history-item-meta">{formatDate(r.createdAt)}</div>
                </div>
                <button
                  className="btn-icon btn-danger"
                  title="Delete"
                  onClick={e => { e.stopPropagation(); onDelete(r.id); }}
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
