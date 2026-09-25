export type ModelId =
  | 'Xenova/whisper-tiny.en'
  | 'Xenova/whisper-base.en'
  | 'Xenova/whisper-small.en';

export type ComputeDevice = 'webgpu' | 'wasm';

export type FileStatus = 'pending' | 'extracting' | 'transcribing' | 'done' | 'error';

export interface Speaker {
  id: string;
  name: string;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number | null;
  text: string;
  speakerId?: string;
}

export interface TranscriptRecord {
  id: string;
  filename: string;
  createdAt: number;
  model: ModelId;
  computeMode: ComputeDevice;
  segments: TranscriptSegment[];
  speakers?: Speaker[];
}

export interface QueuedFile {
  id: string;
  file: File;
  // Present when the file came in via the File System Access API (Chromium), so
  // the recording can be reopened from history later without storing its bytes.
  handle?: FileSystemFileHandle;
  status: FileStatus;
  progress: number;
  progressLabel?: string;
  transcript?: TranscriptRecord;
  error?: string;
  // Timing for the current run (a retry starts a new run), in Date.now() ms
  startedAt?: number;
  // When the transcribing phase began, and the progress it began at (a resumed
  // run starts part-way), so the ETA is based only on this run's pace
  transcribeStartedAt?: number;
  transcribeStartProgress?: number;
  finishedAt?: number;
}

export interface PickedFile {
  file: File;
  handle?: FileSystemFileHandle;
}

export interface AppSettings {
  model: ModelId;
  device: ComputeDevice;
}

// Main thread ⇄ coordinator worker (transcription.worker.ts)
export type WorkerInMessage =
  | {
      type: 'TRANSCRIBE';
      id: string;
      file: File;
      model: ModelId;
      device: ComputeDevice;
      // Upper bound on parallel decoder workers for the CPU (WASM) path,
      // computed on the main thread where device hints are available.
      maxWorkers: number;
    }
  // Drop any partial state kept around for resuming a failed file
  | { type: 'DISCARD'; id: string };

export type WorkerOutMessage =
  | { type: 'MODEL_LOADING'; id: string; progress: number; file: string }
  | { type: 'PREPARING'; id: string; label: string }
  | { type: 'DEVICE_DETECTED'; device: ComputeDevice; workers: number }
  | { type: 'EXTRACTING'; id: string }
  | { type: 'TRANSCRIBING'; id: string; completed: number; total: number; workers: number }
  // `segments`, when present, is the full merged transcript so far (replaces,
  // not appends) — windows finish out of order and are merged in order.
  | { type: 'PROGRESS'; id: string; completed: number; total: number; segments?: TranscriptSegment[] }
  | { type: 'DONE'; id: string; segments: TranscriptSegment[] }
  | { type: 'ERROR'; id: string; error: string };

// Coordinator ⇄ decoder pool workers (decoder.worker.ts)
export type DecoderInMessage =
  | { type: 'LOAD'; model: ModelId; device: ComputeDevice; threads?: number; reportProgress: boolean }
  | { type: 'DECODE'; jobId: number; audio: Float32Array };

export type DecoderOutMessage =
  | { type: 'LOAD_PROGRESS'; progress: number; file: string }
  | { type: 'LOADED'; timePrecision: number }
  | { type: 'LOAD_FAILED'; error: string }
  | { type: 'DECODED'; jobId: number; tokens: bigint[] }
  | { type: 'DECODE_FAILED'; jobId: number; error: string };
