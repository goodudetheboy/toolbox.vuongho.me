import { useState, type CSSProperties, type ReactNode } from 'react';
import faceHappy from '../assets/biggu/face-happy.webp';
import faceSad from '../assets/biggu/face-sad.webp';

// Scrapbook pieces: washi tape, torn-paper cards, stamps and doodles.

const TAPE_COLORS = {
  pink: '#F9C6D3',
  yellow: '#FDE68A',
  mint: '#BDE8D7',
  blue: '#A9D3F5',
  lilac: '#D9CCF5',
} as const;
export type TapeColor = keyof typeof TAPE_COLORS;

/** A strip of washi tape with torn zig-zag ends and a printed pattern. */
export function Tape({
  color = 'pink',
  pattern = 'dots',
  width = 96,
  rotate = -4,
  style,
}: {
  color?: TapeColor;
  pattern?: 'dots' | 'stripes' | 'plain';
  width?: number;
  rotate?: number;
  style?: CSSProperties;
}) {
  const h = 26;
  const teeth = 5;
  const zig = (x: number, dir: 1 | -1) =>
    Array.from({ length: teeth + 1 }, (_, i) => `${x + (i % 2 ? 4 * dir : 0)},${(i * h) / teeth}`).join(' ');
  const pid = `tape-${color}-${pattern}`;
  return (
    <svg className="tape" width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{ transform: `rotate(${rotate}deg)`, ...style }} aria-hidden>
      <defs>
        <pattern id={pid} width="10" height="10" patternUnits="userSpaceOnUse">
          {pattern === 'dots' && <circle cx="5" cy="5" r="1.8" fill="#fff" opacity="0.8" />}
          {pattern === 'stripes' && <path d="M0 10 L10 0" stroke="#fff" strokeWidth="3" opacity="0.6" />}
        </pattern>
      </defs>
      <polygon points={`${zig(0, 1)} ${zig(width, -1).split(' ').reverse().join(' ')}`} fill={TAPE_COLORS[color]} opacity="0.88" />
      <polygon points={`${zig(0, 1)} ${zig(width, -1).split(' ').reverse().join(' ')}`} fill={`url(#${pid})`} />
    </svg>
  );
}

/** A paper card, slightly rotated, optionally taped at the top. */
export function Paper({
  children,
  tilt = 0,
  tape,
  className = '',
  lined = false,
  style,
}: {
  children: ReactNode;
  tilt?: number;
  tape?: TapeColor;
  className?: string;
  lined?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={`paper ${lined ? 'paper-lined' : ''} ${className}`} style={{ transform: `rotate(${tilt}deg)`, ...style }}>
      {tape && <Tape color={tape} pattern={tape === 'yellow' ? 'stripes' : 'dots'} style={{ position: 'absolute', top: -13, left: '50%', marginLeft: -48 }} />}
      {children}
    </div>
  );
}

/** Round score stamp — color shifts from coral to mint as the score rises. */
export function ScoreStamp({ score, size = 54 }: { score?: number; size?: number }) {
  if (score === undefined) return null;
  const color = score >= 80 ? '#3FAE8C' : score >= 50 ? '#F0A532' : '#E5707E';
  return (
    <span className="stamp" style={{ width: size, height: size, borderColor: color, color, fontSize: size * 0.32 }}>
      {score}%
    </span>
  );
}

export function Star({ size = 22, color = '#FFD25E', style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden className="doodle">
      <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill={color} stroke="#5A3818" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const FACES = { happy: faceHappy, sad: faceSad };

/** Biggu's head looking happy or sad — the feedback "thumbs", without emoji. */
export function BigguFace({ mood, size = 34 }: { mood: keyof typeof FACES; size?: number }) {
  return <img src={FACES[mood]} width={size} height={size} alt="" draggable={false} />;
}

// Every head in assets/biggu/heads (calm, wink, blep, tilt, …) — the Home header picks one per visit.
const HEADS = Object.values(import.meta.glob<string>('../assets/biggu/heads/*.webp', { eager: true, import: 'default' }));

/** Biggu's head with a random cute expression, chosen once when it mounts. */
export function RandomBigguHead({ size = 52, className }: { size?: number; className?: string }) {
  const [src] = useState(() => HEADS[Math.floor(Math.random() * HEADS.length)]);
  return <img className={className} src={src} width={size} height={size} alt="" draggable={false} />;
}

export function Heart({ size = 20, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden className="doodle">
      <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#F7879A" stroke="#5A3818" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Hand-drawn style icons for the big buttons. */
export function Icon({ name, size = 28 }: { name: 'mic' | 'stop' | 'paste' | 'file' | 'camera' | 'back' | 'plus' | 'retry' | 'next' | 'dots' | 'trash' | 'book' | 'bulb' | 'pencil' | 'chart'; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<typeof name, ReactNode> = {
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" {...p} />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" {...p} />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />,
    paste: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" {...p} />
        <path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" {...p} />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6z" {...p} />
        <path d="M14 3v4h4M9 12h6M9 16h6" {...p} />
      </>
    ),
    camera: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" {...p} />
        <circle cx="12" cy="13" r="3.5" {...p} />
      </>
    ),
    back: <path d="M15 5l-7 7 7 7" {...p} strokeWidth={3} />,
    plus: <path d="M12 5v14M5 12h14" {...p} strokeWidth={3} />,
    retry: <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" {...p} />,
    next: <path d="M5 12h13M13 6l6 6-6 6" {...p} strokeWidth={2.6} />,
    dots: (
      <>
        <circle cx="5" cy="12" r="1.8" fill="currentColor" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        <circle cx="19" cy="12" r="1.8" fill="currentColor" />
      </>
    ),
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" {...p} />,
    pencil: <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" {...p} />,
    bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" {...p} />,
    chart: <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6" {...p} />,
    book: <path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14" {...p} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {paths[name]}
    </svg>
  );
}
