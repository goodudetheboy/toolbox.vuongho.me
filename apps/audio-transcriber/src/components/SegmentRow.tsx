import { useEffect, useRef, useState } from 'react';
import type { Speaker, TranscriptSegment } from '../types';
import { formatTimestamp, parseTimestamp } from '../lib/formatters';
import { speakerColor } from '../lib/transcript';

interface Props {
  segment: TranscriptSegment;
  speakers: Speaker[];
  editMode: boolean;
  canMergeNext: boolean;
  onSplit: (cursorPos: number) => void;
  onMergeNext: () => void;
  onAssignSpeaker: (speakerId: string | undefined) => void;
  onTextChange: (text: string) => void;
  onStartChange: (start: number) => void;
}

export default function SegmentRow({
  segment,
  speakers,
  editMode,
  canMergeNext,
  onSplit,
  onMergeNext,
  onAssignSpeaker,
  onTextChange,
  onStartChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speaker = speakers.find(s => s.id === segment.speakerId);
  const [draftText, setDraftText] = useState(segment.text);
  const [draftTime, setDraftTime] = useState(formatTimestamp(segment.start));

  useEffect(() => {
    setDraftText(segment.text);
  }, [segment.text]);

  useEffect(() => {
    setDraftTime(formatTimestamp(segment.start));
  }, [segment.start]);

  const handleSplit = () => {
    const pos = textareaRef.current?.selectionStart ?? 0;
    onSplit(pos);
  };

  const handleBlur = () => {
    const trimmed = draftText.trim();
    if (trimmed && trimmed !== segment.text) {
      onTextChange(draftText);
    } else {
      setDraftText(segment.text);
    }
  };

  const handleTimeBlur = () => {
    const parsed = parseTimestamp(draftTime);
    if (parsed !== null && parsed !== segment.start) {
      onStartChange(parsed);
    } else {
      setDraftTime(formatTimestamp(segment.start));
    }
  };

  return (
    <div className="transcript-segment">
      {editMode ? (
        <input
          type="text"
          className="segment-time-input"
          value={draftTime}
          onChange={e => setDraftTime(e.target.value)}
          onBlur={handleTimeBlur}
        />
      ) : (
        <span className="segment-time">{formatTimestamp(segment.start)}</span>
      )}

      <div className="segment-body">
        {speaker && !editMode && (
          <span className="speaker-badge" style={{ '--speaker-color': speakerColor(speaker.id) } as React.CSSProperties}>
            {speaker.name}
          </span>
        )}

        {editMode ? (
          <textarea
            ref={textareaRef}
            className="segment-textarea"
            rows={Math.max(1, Math.ceil(draftText.length / 60))}
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            onBlur={handleBlur}
          />
        ) : (
          <span className="segment-text">{segment.text}</span>
        )}

        {editMode && (
          <div className="segment-controls">
            <select
              className="speaker-select"
              value={segment.speakerId ?? ''}
              onChange={e => onAssignSpeaker(e.target.value || undefined)}
            >
              <option value="">Unassigned</option>
              {speakers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn-ghost" onClick={handleSplit} title="Split at cursor">
              ✂️ Split
            </button>
            {canMergeNext && (
              <button className="btn-ghost" onClick={onMergeNext} title="Merge with next segment">
                ⬇ Merge
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
