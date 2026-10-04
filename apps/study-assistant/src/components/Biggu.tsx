import { useId } from 'react';

// Biggu — a chubby brown-grey tabby, drawn as a die-cut sticker (white border +
// soft shadow come from the SVG filter, so he reads as a cut-out on the paper).
// One drawing, with the face/paws/props swapped per mood.

export type BigguMood = 'wave' | 'read' | 'listen' | 'hint' | 'cheer' | 'proud' | 'sleepy' | 'think';

interface Props {
  mood?: BigguMood;
  size?: number;
  className?: string;
  title?: string;
}

const C = {
  fur: '#9A8878', // brown-grey tabby
  furLight: '#B4A494',
  stripe: '#5C4B3F',
  cream: '#F4ECE0',
  line: '#3A2D24',
  pink: '#E9A0A6',
  innerEar: '#E8B9B3',
  eye: '#2B211B',
};

export default function Biggu({ mood = 'wave', size = 160, className, title = 'Biggu' }: Props) {
  const id = useId().replace(/:/g, '');
  const happyEyes = mood === 'cheer' || mood === 'proud' || mood === 'wave';
  const closedEyes = mood === 'sleepy';
  const leftPawUp = mood === 'wave' || mood === 'cheer' || mood === 'hint';
  const rightPawUp = mood === 'cheer';

  return (
    <svg
      className={className}
      width={size}
      height={size * 1.1}
      viewBox="0 0 200 220"
      role="img"
      aria-label={title}
    >
      <defs>
        {/* Die-cut sticker: grow the silhouette into a white border, then a soft drop shadow. */}
        <filter id={`sticker-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="grown" />
          <feFlood floodColor="#ffffff" />
          <feComposite in2="grown" operator="in" result="border" />
          <feGaussianBlur in="grown" stdDeviation="3" result="blur" />
          <feOffset in="blur" dx="2" dy="4" result="offsetBlur" />
          <feFlood floodColor="#3b5b7a" floodOpacity="0.28" />
          <feComposite in2="offsetBlur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="border" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`cheek-${id}`}>
          <stop offset="0%" stopColor={C.pink} stopOpacity="0.75" />
          <stop offset="100%" stopColor={C.pink} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#sticker-${id})`} strokeLinecap="round" strokeLinejoin="round">
        {/* Tail, curling up behind the body on the right */}
        <path
          d="M150 190 C190 186 196 150 182 128 C176 118 166 120 168 130 C176 150 170 172 146 176 Z"
          fill={C.fur}
          stroke={C.line}
          strokeWidth="3"
        />
        <path d="M184 140 l-12 4 M186 156 l-13 1 M180 171 l-12 -4" stroke={C.stripe} strokeWidth="5" fill="none" />

        {/* Body */}
        <path
          d="M52 200 C40 168 50 128 100 124 C150 128 160 168 148 200 C136 212 64 212 52 200 Z"
          fill={C.fur}
          stroke={C.line}
          strokeWidth="3"
        />
        <path d="M74 200 C68 170 80 146 100 144 C120 146 132 170 126 200 Z" fill={C.cream} />
        {/* Body stripes */}
        <path d="M56 160 q10 2 14 10 M54 178 q10 0 14 8 M144 160 q-10 2 -14 10 M146 178 q-10 0 -14 8" stroke={C.stripe} strokeWidth="5" fill="none" />

        {/* Feet */}
        <ellipse cx="74" cy="204" rx="17" ry="10" fill={C.cream} stroke={C.line} strokeWidth="3" />
        <ellipse cx="126" cy="204" rx="17" ry="10" fill={C.cream} stroke={C.line} strokeWidth="3" />
        <path d="M68 200 v7 M76 200 v7 M120 200 v7 M128 200 v7" stroke={C.line} strokeWidth="2" />

        {/* Front paws (down unless raised) */}
        {!leftPawUp && <ellipse cx="84" cy="186" rx="12" ry="9" fill={C.cream} stroke={C.line} strokeWidth="3" />}
        {!rightPawUp && mood !== 'read' && <ellipse cx="116" cy="186" rx="12" ry="9" fill={C.cream} stroke={C.line} strokeWidth="3" />}

        {/* Head */}
        <g>
          {/* Ears */}
          <path d="M44 72 L50 22 C52 16 58 16 62 20 L88 48 Z" fill={C.fur} stroke={C.line} strokeWidth="3" />
          <path d="M53 58 L56 30 L76 50 Z" fill={C.innerEar} />
          <path
            d={mood === 'listen' ? 'M156 72 L156 14 C155 8 148 8 144 12 L112 48 Z' : 'M156 72 L150 22 C148 16 142 16 138 20 L112 48 Z'}
            fill={C.fur}
            stroke={C.line}
            strokeWidth="3"
          />
          <path d={mood === 'listen' ? 'M147 58 L148 24 L124 50 Z' : 'M147 58 L144 30 L124 50 Z'} fill={C.innerEar} />

          <ellipse cx="100" cy="86" rx="66" ry="54" fill={C.fur} stroke={C.line} strokeWidth="3" />

          {/* Tabby "M" on the forehead + head stripes */}
          <path d="M86 46 l4 14 l10 -10 l10 10 l4 -14" stroke={C.stripe} strokeWidth="5" fill="none" />
          <path d="M100 36 v12 M70 52 q6 6 6 14 M130 52 q-6 6 -6 14" stroke={C.stripe} strokeWidth="5" fill="none" />
          {/* Cheek stripes */}
          <path d="M36 82 h14 M38 96 h12 M164 82 h-14 M162 96 h-12" stroke={C.stripe} strokeWidth="5" fill="none" />

          {/* Muzzle */}
          <ellipse cx="88" cy="110" rx="16" ry="12" fill={C.cream} />
          <ellipse cx="112" cy="110" rx="16" ry="12" fill={C.cream} />

          {/* Blush */}
          <ellipse cx="58" cy="106" rx="13" ry="8" fill={`url(#cheek-${id})`} />
          <ellipse cx="142" cy="106" rx="13" ry="8" fill={`url(#cheek-${id})`} />

          {/* Eyes */}
          {happyEyes ? (
            <path d="M64 88 q10 -12 20 0 M116 88 q10 -12 20 0" stroke={C.eye} strokeWidth="4.5" fill="none" />
          ) : closedEyes ? (
            <path d="M64 88 q10 8 20 0 M116 88 q10 8 20 0" stroke={C.eye} strokeWidth="4.5" fill="none" />
          ) : (
            <g>
              <ellipse cx="74" cy={mood === 'read' ? 92 : 86} rx="9" ry={mood === 'listen' ? 12 : 11} fill={C.eye} />
              <ellipse cx="126" cy={mood === 'read' ? 92 : 86} rx="9" ry={mood === 'listen' ? 12 : 11} fill={C.eye} />
              <circle cx={mood === 'think' ? 74 : 77} cy={mood === 'read' ? 88 : 81} r="3.5" fill="#fff" />
              <circle cx={mood === 'think' ? 126 : 129} cy={mood === 'read' ? 88 : 81} r="3.5" fill="#fff" />
              <circle cx="72" cy={mood === 'read' ? 95 : 90} r="1.6" fill="#fff" />
              <circle cx="124" cy={mood === 'read' ? 95 : 90} r="1.6" fill="#fff" />
            </g>
          )}

          {/* Nose + mouth */}
          <path d="M94 100 h12 l-6 7 z" fill={C.pink} stroke={C.line} strokeWidth="2" />
          {mood === 'cheer' || mood === 'wave' ? (
            <path d="M88 110 q6 12 12 0 q6 12 12 0 q-12 14 -24 0 z" fill="#C8505F" stroke={C.line} strokeWidth="2.5" />
          ) : mood === 'think' ? (
            <path d="M92 114 q8 -4 16 2" stroke={C.line} strokeWidth="2.5" fill="none" />
          ) : (
            <path d="M100 107 v3 M88 110 q6 7 12 0 q6 7 12 0" stroke={C.line} strokeWidth="2.5" fill="none" />
          )}

          {/* Whiskers */}
          <path d="M70 108 l-30 -4 M70 114 l-28 4 M130 108 l30 -4 M130 114 l28 4" stroke={C.line} strokeWidth="1.6" opacity="0.7" />
        </g>

        {/* Raised paws */}
        {leftPawUp && (
          <g>
            <path d="M58 150 C44 140 36 124 40 112" stroke={C.line} strokeWidth="3" fill="none" />
            <path d="M58 150 C46 142 38 128 40 112 L56 116 C56 128 62 138 70 146 Z" fill={C.fur} />
            <ellipse cx="46" cy="108" rx="12" ry="11" fill={C.cream} stroke={C.line} strokeWidth="3" />
            <path d="M41 103 v6 M47 101 v6 M53 104 v5" stroke={C.line} strokeWidth="1.8" />
          </g>
        )}
        {rightPawUp && (
          <g>
            <path d="M142 150 C156 140 164 124 160 112 L144 116 C144 128 138 138 130 146 Z" fill={C.fur} />
            <ellipse cx="154" cy="108" rx="12" ry="11" fill={C.cream} stroke={C.line} strokeWidth="3" />
            <path d="M149 104 v5 M155 101 v6 M161 103 v6" stroke={C.line} strokeWidth="1.8" />
          </g>
        )}

        {/* Props */}
        {mood === 'read' && (
          <g>
            <path d="M70 176 L100 168 L130 176 L130 204 L100 196 L70 204 Z" fill="#7FB8E6" stroke={C.line} strokeWidth="3" />
            <path d="M100 168 V196" stroke={C.line} strokeWidth="2.5" />
            <path d="M78 180 l14 -3 M78 187 l14 -3 M108 177 l14 3 M108 184 l14 3" stroke="#fff" strokeWidth="2" />
            <ellipse cx="72" cy="190" rx="9" ry="8" fill={C.cream} stroke={C.line} strokeWidth="3" />
            <ellipse cx="128" cy="190" rx="9" ry="8" fill={C.cream} stroke={C.line} strokeWidth="3" />
          </g>
        )}
        {mood === 'hint' && (
          <g>
            <circle cx="30" cy="70" r="15" fill="#FFE27A" stroke={C.line} strokeWidth="3" />
            <rect x="24" y="84" width="12" height="9" rx="2" fill="#B9C6D3" stroke={C.line} strokeWidth="2.5" />
            <path d="M30 46 v-8 M10 58 l-6 -5 M50 58 l6 -5" stroke="#F2B705" strokeWidth="3" />
          </g>
        )}
      </g>

      {/* Floating decorations (outside the sticker so they stay light) */}
      {mood === 'cheer' && (
        <g fill="#FFD25E" stroke={C.line} strokeWidth="2">
          <path d="M20 40 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z" />
          <path d="M176 28 l3 7 8 1 -6 5 2 8 -7 -5 -7 5 2 -8 -6 -5 8 -1z" />
        </g>
      )}
      {mood === 'proud' && <path d="M176 36 c-6 -10 -20 -4 -14 6 l14 14 14 -14 c6 -10 -8 -16 -14 -6z" fill="#F7879A" stroke={C.line} strokeWidth="2" />}
      {mood === 'sleepy' && (
        <g fill={C.line} fontFamily="'Patrick Hand', cursive" fontWeight="700">
          <text x="160" y="40" fontSize="22">z</text>
          <text x="174" y="24" fontSize="16">z</text>
        </g>
      )}
      {mood === 'listen' && (
        <g stroke="#4FA3E0" strokeWidth="4" fill="none" className="biggu-waves">
          <path d="M178 54 q8 10 0 20" />
          <path d="M188 46 q14 18 0 36" />
        </g>
      )}
      {mood === 'think' && (
        <g fill="#fff" stroke={C.line} strokeWidth="2">
          <circle cx="170" cy="40" r="5" />
          <circle cx="182" cy="24" r="8" />
        </g>
      )}
    </svg>
  );
}
