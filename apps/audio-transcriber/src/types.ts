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
  status: FileStatus;
  progress: number;
  progressLabel?: string;
  transcript?: TranscriptRecord;
  error?: string;
}

export interface AppSettings {
  model: ModelId;
  device: ComputeDevice;
}

// Worker message protocol
export type WorkerInMessage = {
  type: 'TRANSCRIBE';
  id: string;
  file: File;
  model: ModelId;
  device: ComputeDevice;
};

export type WorkerOutMessage =
  | { type: 'MODEL_LOADING'; id: string; progress: number; file: string }
  | { type: 'DEVICE_DETECTED'; device: ComputeDevice }
  | { type: 'EXTRACTING'; id: string }
  | { type: 'TRANSCRIBING'; id: string; totalChunks: number }
  | { type: 'CHUNK_DONE'; id: string; segments: TranscriptSegment[]; chunkIndex: number; totalChunks: number }
  | { type: 'DONE'; id: string }
  | { type: 'ERROR'; id: string; error: string };
