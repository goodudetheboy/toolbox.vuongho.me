import { useEffect, useRef, useState } from 'react';
import contentHead from '../assets/biggu/heads/content.webp';
import { purr } from '../lib/purr';
import { t } from '../strings';
import Biggu, { type BigguMood } from './Biggu';
import { RandomBigguHead } from './Scrap';

/** Tap → purr; `purring` is true while it plays. Ends cleanly if the component goes away mid-purr. */
export function usePet() {
  const [purring, setPurring] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pet = () => {
    if (purr(() => alive.current && setPurring(false))) setPurring(true);
  };
  return { purring, pet };
}

/** Biggu's head (random expression); tap to pet: he purrs with his eyes blissfully closed. */
export function PettableHead({ size = 52, className = '' }: { size?: number; className?: string }) {
  const { purring, pet } = usePet();
  return (
    <button type="button" className={`pet ${purring ? 'purring' : ''} ${className}`} onClick={pet} aria-label={t.petBiggu}>
      {purring ? <img src={contentHead} width={size} height={size} alt="" draggable={false} /> : <RandomBigguHead size={size} />}
    </button>
  );
}

/** Full-body Biggu; tap to pet: he purrs and looks proud and happy. */
export function PettableBiggu({ mood, size, className = '' }: { mood: BigguMood; size: number; className?: string }) {
  const { purring, pet } = usePet();
  return (
    <button type="button" className={`pet ${purring ? 'purring' : ''} ${className}`} onClick={pet} aria-label={t.petBiggu}>
      <Biggu mood={purring ? 'proud' : mood} size={size} />
    </button>
  );
}
