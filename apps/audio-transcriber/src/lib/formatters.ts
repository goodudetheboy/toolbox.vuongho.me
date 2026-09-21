import type { Speaker, TranscriptSegment } from '../types';

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseTimestamp(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;

  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, ...nums];
  if (m >= 60 || s >= 60) return null;

  return h * 3600 + m * 60 + s;
}

export function segmentsToText(segments: TranscriptSegment[], speakers: Speaker[] = []): string {
  return segments
    .map(s => {
      const speaker = speakers.find(sp => sp.id === s.speakerId);
      const speakerTag = speaker ? ` (${speaker.name})` : '';
      return `[${formatTimestamp(s.start)}]${speakerTag} ${s.text}`;
    })
    .join('\n');
}

function formatSrtTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function segmentsToSrt(segments: TranscriptSegment[], speakers: Speaker[] = []): string {
  return segments
    .map((seg, i) => {
      const fallbackEnd = segments[i + 1]?.start ?? seg.start + 2;
      const end = seg.end !== null && seg.end > seg.start ? seg.end : fallbackEnd;
      const speaker = speakers.find(sp => sp.id === seg.speakerId);
      const speakerTag = speaker ? `(${speaker.name}) ` : '';
      return `${i + 1}\n${formatSrtTimestamp(seg.start)} --> ${formatSrtTimestamp(end)}\n${speakerTag}${seg.text.trim()}\n`;
    })
    .join('\n');
}

function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.');
}

export function segmentsToVtt(segments: TranscriptSegment[], speakers: Speaker[] = []): string {
  const cues = segments
    .map((seg, i) => {
      const fallbackEnd = segments[i + 1]?.start ?? seg.start + 2;
      const end = seg.end !== null && seg.end > seg.start ? seg.end : fallbackEnd;
      const speaker = speakers.find(sp => sp.id === seg.speakerId);
      const speakerTag = speaker ? `(${speaker.name}) ` : '';
      return `${formatVttTimestamp(seg.start)} --> ${formatVttTimestamp(end)}\n${speakerTag}${seg.text.trim()}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${cues}\n`;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts));
}
