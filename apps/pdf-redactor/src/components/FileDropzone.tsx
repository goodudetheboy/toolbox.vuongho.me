import { useRef, useState, type DragEvent } from 'react';

interface Props {
  onFileSelected: (file: File) => void;
}

export default function FileDropzone({ onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && file.type === 'application/pdf') {
      onFileSelected(file);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`dropzone${isDragging ? ' dropzone-active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <p>Drop a PDF here, or click to choose a file</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
