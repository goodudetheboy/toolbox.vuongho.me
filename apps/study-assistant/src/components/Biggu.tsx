import wave from '../assets/biggu/wave.webp';
import read from '../assets/biggu/read.webp';
import listen from '../assets/biggu/listen.webp';
import hint from '../assets/biggu/hint.webp';
import cheer from '../assets/biggu/cheer.webp';
import proud from '../assets/biggu/proud.webp';
import sleepy from '../assets/biggu/sleepy.webp';
import think from '../assets/biggu/think.webp';

// Biggu — the real Biggu (a brown-grey mackerel tabby), drawn in colored pencil
// as a hand-cut paper sticker. One Gemini-generated illustration per mood; how
// they were made is in ADR 0001's "Biggu illustrations" addendum.

export type BigguMood = 'wave' | 'read' | 'listen' | 'hint' | 'cheer' | 'proud' | 'sleepy' | 'think';

const ART: Record<BigguMood, string> = { wave, read, listen, hint, cheer, proud, sleepy, think };

interface Props {
  mood?: BigguMood;
  size?: number;
  className?: string;
  title?: string;
}

export default function Biggu({ mood = 'wave', size = 160, className, title = 'Biggu' }: Props) {
  return (
    <img
      className={`biggu ${className ?? ''}`}
      src={ART[mood]}
      width={size}
      height={size}
      alt={title}
      draggable={false}
    />
  );
}
