import { useId } from 'react';
import type { ToolModel } from './tools';

// Flat-ish illustrations of the same props the 3D toolbox uses, so the list
// view and the info panel read as the same objects.
export function ToolIcon({ model, size = 56 }: { model: ToolModel; size?: number }) {
  const id = useId().replace(/:/g, '');
  const g = (name: string) => `${name}-${id}`;
  const url = (name: string) => `url(#${g(name)})`;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g('chrome')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6f8" />
          <stop offset="0.45" stopColor="#aeb3b8" />
          <stop offset="0.55" stopColor="#8a9096" />
          <stop offset="1" stopColor="#d9dde1" />
        </linearGradient>
        <linearGradient id={g('black')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3d" />
          <stop offset="0.35" stopColor="#141416" />
          <stop offset="1" stopColor="#050506" />
        </linearGradient>
        <radialGradient id={g('ball')} cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c7cbcf" />
          <stop offset="1" stopColor="#6b7176" />
        </radialGradient>
        <radialGradient id={g('brass')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f3d27a" />
          <stop offset="0.55" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#8a6a24" />
        </radialGradient>
        <pattern id={g('mesh')} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H2.4M0 0V2.4" stroke="#5d6368" strokeWidth="0.5" fill="none" />
        </pattern>
      </defs>

      {model === 'marker' && (
        <g transform="rotate(-35 32 32)">
          <rect x="6" y="27" width="10" height="10" rx="1.5" fill={url('black')} />
          <path d="M6 28.5 L2.5 30.8 L2.5 33.2 L6 35.5 Z" fill="#0a0a0a" />
          <rect x="15" y="26.5" width="30" height="11" fill={url('black')} />
          <rect x="18" y="28" width="23" height="8" fill="#f2f2ee" />
          <rect x="20" y="30.2" width="10" height="1.6" fill="#111" />
          <rect x="20" y="33" width="15" height="1" fill="#111" opacity="0.7" />
          <rect x="44" y="25.5" width="17" height="13" rx="4" fill={url('black')} />
          <rect x="47" y="23.4" width="12" height="3" rx="1.4" fill="#1d1d20" />
          <rect x="44" y="26.2" width="17" height="2" rx="1" fill="#fff" opacity="0.12" />
        </g>
      )}

      {model === 'microphone' && (
        <g transform="rotate(-40 32 32)">
          <path d="M8 29.5 L34 27 L34 37 L8 34.5 Z" fill={url('black')} />
          <rect x="5" y="29.3" width="4" height="5.4" rx="1" fill={url('chrome')} />
          <rect x="20" y="30.3" width="4" height="3.4" rx="0.8" fill={url('chrome')} />
          <rect x="33" y="25.8" width="5" height="12.4" rx="1.2" fill={url('chrome')} />
          <circle cx="47" cy="32" r="11" fill={url('ball')} />
          <circle cx="47" cy="32" r="11" fill={url('mesh')} opacity="0.8" />
          <ellipse cx="43.5" cy="27.5" rx="4" ry="2.6" fill="#fff" opacity="0.55" />
        </g>
      )}

      {model === 'compass' && (
        <g>
          <circle cx="32" cy="8" r="4.2" fill="none" stroke={url('brass')} strokeWidth="2" />
          <rect x="30" y="10.5" width="4" height="4" rx="1" fill={url('brass')} />
          <circle cx="32" cy="36" r="23" fill={url('brass')} />
          <circle cx="32" cy="36" r="19" fill="#efe8d6" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const long = i % 6 === 0;
            const r1 = 18, r2 = long ? 14.5 : 16.3;
            return (
              <line
                key={i}
                x1={32 + Math.sin(a) * r1}
                y1={36 - Math.cos(a) * r1}
                x2={32 + Math.sin(a) * r2}
                y2={36 - Math.cos(a) * r2}
                stroke="#2a241c"
                strokeWidth={long ? 1.1 : 0.6}
              />
            );
          })}
          <text x="32" y="27" textAnchor="middle" fontSize="6" fontWeight="700" fontFamily="Georgia, serif" fill="#a3261d">N</text>
          <g transform="rotate(28 32 36)">
            <path d="M32 21 L34.2 36 L29.8 36 Z" fill="#b3261e" />
            <path d="M32 51 L34.2 36 L29.8 36 Z" fill="#fbfaf6" stroke="#b9b3a4" strokeWidth="0.4" />
          </g>
          <circle cx="32" cy="36" r="1.6" fill={url('brass')} />
          <ellipse cx="25" cy="27" rx="7" ry="3.5" fill="#fff" opacity="0.25" transform="rotate(-30 25 27)" />
        </g>
      )}

      {model === 'wrench' && (
        <g transform="rotate(-45 32 32)">
          <rect x="16" y="28.5" width="32" height="7" rx="2" fill={url('chrome')} />
          <circle cx="12" cy="32" r="8" fill={url('chrome')} />
          <circle cx="12" cy="32" r="4.4" fill="var(--icon-bg, #1a1814)" />
          <path d="M52 22.5 A10 10 0 1 1 52 41.5 L 56 36 L 49 36 L 49 28 L 56 28 Z" fill={url('chrome')} />
        </g>
      )}
    </svg>
  );
}
