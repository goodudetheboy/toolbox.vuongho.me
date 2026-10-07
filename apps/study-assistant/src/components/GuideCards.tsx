import { useEffect, useRef, useState } from 'react';
import { t } from '../strings';
import Biggu, { type BigguMood } from './Biggu';
import { PettableBiggu } from './Pettable';
import { Paper, type TapeColor } from './Scrap';

// "How it works": five swipeable taped cards, one idea and one Biggu pose each. Swiping is
// native horizontal scroll-snap; the dots and Next follow the scroll position.

const MOODS: BigguMood[] = ['read', 'listen', 'hint', 'proud', 'cheer'];
const TAPES: TapeColor[] = ['pink', 'mint', 'yellow', 'lilac', 'blue'];
const TILTS = [-0.6, 0.5, -0.4, 0.6, -0.5];

export default function GuideCards({
  finishLabel,
  onFinish,
  onSkip,
}: {
  finishLabel: string;
  onFinish: () => void;
  /** Leave without finishing. Omitted → Skip jumps to the last card. */
  onSkip?: () => void;
}) {
  const cards = t.guide.cards;
  const last = cards.length - 1;
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setAt(Math.min(last, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [last]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    setAt(i);
  };

  return (
    <div className="guide">
      <div className="guide-track" ref={track}>
        {cards.map((c, i) => (
          <section key={c.title} className="guide-slide" aria-label={t.guide.card(i + 1, cards.length)} aria-hidden={i !== at}>
            <Paper tilt={TILTS[i]} tape={TAPES[i]} className="guide-card">
              {i === last ? (
                <PettableBiggu mood={MOODS[i]} size={150} />
              ) : (
                <Biggu mood={MOODS[i]} size={150} />
              )}
              <h2 className="hand guide-title">{c.title}</h2>
              <p className="guide-text">{c.text}</p>
              {i === last && <p className="guide-purr hand">{t.guide.purr}</p>}
            </Paper>
          </section>
        ))}
      </div>

      <div className="guide-dots" role="tablist">
        {cards.map((c, i) => (
          <button
            key={c.title}
            role="tab"
            aria-selected={i === at}
            aria-label={t.guide.card(i + 1, cards.length)}
            className={i === at ? 'on' : ''}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <div className="guide-actions">
        {at < last ? (
          <>
            <button className="btn" onClick={() => (onSkip ? onSkip() : go(last))}>
              {t.guide.skip}
            </button>
            <button className="btn btn-primary" onClick={() => go(at + 1)}>
              {t.guide.next}
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-big" onClick={onFinish}>
            {finishLabel}
          </button>
        )}
      </div>
    </div>
  );
}
