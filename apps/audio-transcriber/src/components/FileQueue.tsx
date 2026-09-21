import type { QueuedFile, FileStatus } from '../types';

interface Props {
  files: QueuedFile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) return '🎬';
  return '🎵';
}

function statusDot(status: FileStatus): string {
  if (status === 'done') return 'done';
  if (status === 'error') return 'error';
  if (status === 'pending') return 'pending';
  return 'working';
}

function statusLabel(file: QueuedFile): string {
  if (file.status === 'done') return 'Done';
  if (file.status === 'error') return file.error ?? 'Error';
  if (file.status === 'pending') return 'Waiting…';
  return file.progressLabel ?? 'Processing…';
}

export default function FileQueue({ files, activeId, onSelect, onRemove }: Props) {
  return (
    <div className="queue-panel">
      <div className="queue-header">{files.length} file{files.length !== 1 ? 's' : ''}</div>
      <div className="queue-list">
        {files.map(f => (
          <div
            key={f.id}
            className={`queue-item ${f.id === activeId ? 'active' : ''}`}
            onClick={() => f.status === 'done' && onSelect(f.id)}
          >
            <span className="queue-item-icon">{fileIcon(f.file.name)}</span>
            <div className="queue-item-info">
              <div className="queue-item-name" title={f.file.name}>{f.file.name}</div>
              <div className="queue-item-status" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className={`status-dot ${statusDot(f.status)}`} />
                <span>{statusLabel(f)}</span>
              </div>
              {(f.status === 'extracting' || f.status === 'transcribing') && (
                <div className="progress-bar">
                  <div
                    className={`progress-bar-fill ${f.progress === 0 ? 'indeterminate' : ''}`}
                    style={{ width: `${Math.round(f.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
            <button
              className="queue-item-remove"
              title="Remove"
              onClick={e => { e.stopPropagation(); onRemove(f.id); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
