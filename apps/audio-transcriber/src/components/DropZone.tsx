import { useRef, useState, useCallback } from 'react';

interface Props {
  onFiles: (files: File[]) => void;
  hasFiles: boolean;
}

const ACCEPT = 'video/*,audio/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac';

export default function DropZone({ onFiles, hasFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter(f =>
      f.type.startsWith('video/') || f.type.startsWith('audio/') || f.size > 0
    );
    if (files.length) onFiles(files);
  }, [onFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  if (hasFiles) {
    return (
      <div
        className={`dropzone dropzone-compact ${dragging ? 'drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-left">
          <span>🎙️</span>
          <span>Drop more files or click to browse</span>
        </div>
        <button className="btn-secondary" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
          Add files
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={e => handleFiles(e.target.files)} />
      </div>
    );
  }

  return (
    <div
      className={`dropzone ${dragging ? 'drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <div className="dropzone-icon">🎙️</div>
      <h2>Drop your audio or video files here</h2>
      <p>MP4, MOV, MKV, MP3, WAV, M4A, and more — transcribed privately in your browser</p>
      <button className="btn-primary" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
        Browse files
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={e => handleFiles(e.target.files)} />
    </div>
  );
}
