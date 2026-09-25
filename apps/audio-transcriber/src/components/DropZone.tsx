import { useState, useCallback } from 'react';
import { Mic } from 'lucide-react';
import type { PickedFile } from '../types';
import { filesFromDrop, pickMediaFiles } from '../lib/filePicker';

interface Props {
  onFiles: (files: PickedFile[]) => void;
  hasFiles: boolean;
}

export default function DropZone({ onFiles, hasFiles }: Props) {
  const [dragging, setDragging] = useState(false);

  const handlePicked = useCallback((picked: PickedFile[]) => {
    if (picked.length) onFiles(picked);
  }, [onFiles]);

  const browse = useCallback(() => {
    pickMediaFiles(true).then(handlePicked).catch(console.error);
  }, [handlePicked]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    filesFromDrop(e.dataTransfer).then(handlePicked).catch(console.error);
  };

  if (hasFiles) {
    return (
      <div
        className={`dropzone dropzone-compact ${dragging ? 'drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={browse}
      >
        <div className="dropzone-left">
          <Mic size={18} className="dropzone-left-icon" />
          <span>Drop more files or click to browse</span>
        </div>
        <button className="btn-secondary" onClick={e => { e.stopPropagation(); browse(); }}>
          Add files
        </button>
      </div>
    );
  }

  return (
    <div
      className={`dropzone ${dragging ? 'drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={browse}
    >
      <div className="dropzone-icon"><Mic size={26} /></div>
      <h2>Drop your audio or video files here</h2>
      <p>MP4, MOV, MKV, MP3, WAV, M4A, and more — transcribed privately in your browser</p>
      <button className="btn-primary" onClick={e => { e.stopPropagation(); browse(); }}>
        Browse files
      </button>
    </div>
  );
}
