import type { Speaker, TranscriptRecord, TranscriptSegment } from '../types';

const FALLBACK_CHARS_PER_SECOND = 15;

export function normalizeTranscript(record: TranscriptRecord): TranscriptRecord {
  return {
    ...record,
    segments: record.segments.map(seg => (seg.id ? seg : { ...seg, id: crypto.randomUUID() })),
    speakers: record.speakers ?? [],
  };
}

function estimateCharsPerSecond(segments: TranscriptSegment[]): number {
  const closed = segments.filter(s => s.end !== null && s.end > s.start && s.text.length > 0);
  if (closed.length === 0) return FALLBACK_CHARS_PER_SECOND;
  const rate = closed.reduce((sum, s) => sum + s.text.length / (s.end! - s.start), 0) / closed.length;
  return rate > 0 ? rate : FALLBACK_CHARS_PER_SECOND;
}

export function splitSegmentAt(
  segments: TranscriptSegment[],
  index: number,
  cursorPos: number,
): TranscriptSegment[] {
  const original = segments[index];
  const textA = original.text.slice(0, cursorPos).trim();
  const textB = original.text.slice(cursorPos).trim();
  if (!textA || !textB) return segments;

  let midpoint: number;
  if (original.end !== null) {
    const ratio = textA.length / (textA.length + textB.length);
    midpoint = original.start + (original.end - original.start) * ratio;
  } else {
    const rate = estimateCharsPerSecond(segments);
    midpoint = original.start + textA.length / rate;
  }

  const segA: TranscriptSegment = {
    id: crypto.randomUUID(),
    start: original.start,
    end: midpoint,
    text: textA,
    speakerId: original.speakerId,
  };
  const segB: TranscriptSegment = {
    id: crypto.randomUUID(),
    start: midpoint,
    end: original.end,
    text: textB,
    speakerId: original.speakerId,
  };

  return [...segments.slice(0, index), segA, segB, ...segments.slice(index + 1)];
}

export function mergeWithNext(segments: TranscriptSegment[], index: number): TranscriptSegment[] {
  const segA = segments[index];
  const segB = segments[index + 1];
  if (!segA || !segB) return segments;

  const merged: TranscriptSegment = {
    id: crypto.randomUUID(),
    start: segA.start,
    end: segB.end,
    text: `${segA.text.trim()} ${segB.text.trim()}`.trim(),
    speakerId: segA.speakerId ?? segB.speakerId,
  };

  return [...segments.slice(0, index), merged, ...segments.slice(index + 2)];
}

export function editSegmentText(
  segments: TranscriptSegment[],
  index: number,
  text: string,
): TranscriptSegment[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed === segments[index]?.text) return segments;
  return segments.map((seg, i) => (i === index ? { ...seg, text: trimmed } : seg));
}

export function setSegmentStart(
  segments: TranscriptSegment[],
  index: number,
  start: number,
): TranscriptSegment[] {
  if (start === segments[index]?.start) return segments;
  return segments.map((seg, i) => (i === index ? { ...seg, start } : seg));
}

export function assignSpeaker(
  segments: TranscriptSegment[],
  index: number,
  speakerId: string | undefined,
): TranscriptSegment[] {
  return segments.map((seg, i) => (i === index ? { ...seg, speakerId } : seg));
}

export function addSpeaker(record: TranscriptRecord): TranscriptRecord {
  const speakers = record.speakers ?? [];
  const existingNames = new Set(speakers.map(s => s.name));
  let n = speakers.length + 1;
  while (existingNames.has(`Speaker ${n}`)) n++;
  const speaker: Speaker = { id: crypto.randomUUID(), name: `Speaker ${n}` };
  return { ...record, speakers: [...speakers, speaker] };
}

export function renameSpeaker(record: TranscriptRecord, id: string, name: string): TranscriptRecord {
  const speakers = (record.speakers ?? []).map(s => (s.id === id ? { ...s, name } : s));
  return { ...record, speakers };
}

export function removeSpeaker(record: TranscriptRecord, id: string): TranscriptRecord {
  const speakers = (record.speakers ?? []).filter(s => s.id !== id);
  const segments = record.segments.map(seg =>
    seg.speakerId === id ? { ...seg, speakerId: undefined } : seg,
  );
  return { ...record, speakers, segments };
}

const SPEAKER_PALETTE = ['#ff8a65', '#4fc3a1', '#7a9eff', '#c98bdb', '#e0a458', '#5fb3d9'];

export function speakerColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return SPEAKER_PALETTE[Math.abs(hash) % SPEAKER_PALETTE.length];
}
