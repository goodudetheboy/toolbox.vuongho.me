import { useState } from 'react';
import type { Speaker } from '../types';
import { speakerColor } from '../lib/transcript';

interface Props {
  speakers: Speaker[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

export default function SpeakerRoster({ speakers, onAdd, onRename, onRemove }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const startEditing = (speaker: Speaker) => {
    setEditingId(speaker.id);
    setDraftName(speaker.name);
  };

  const commitEdit = () => {
    if (editingId && draftName.trim()) onRename(editingId, draftName.trim());
    setEditingId(null);
  };

  return (
    <div className="speaker-roster">
      {speakers.map(speaker => (
        <div key={speaker.id} className="speaker-chip" style={{ '--speaker-color': speakerColor(speaker.id) } as React.CSSProperties}>
          <span className="speaker-dot" />
          {editingId === speaker.id ? (
            <input
              className="speaker-name-input"
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
          ) : (
            <span className="speaker-chip-name" onClick={() => startEditing(speaker)}>
              {speaker.name}
            </span>
          )}
          <button className="speaker-chip-remove" title="Remove speaker" onClick={() => onRemove(speaker.id)}>
            ×
          </button>
        </div>
      ))}
      <button className="btn-ghost" onClick={onAdd}>
        + Add speaker
      </button>
    </div>
  );
}
