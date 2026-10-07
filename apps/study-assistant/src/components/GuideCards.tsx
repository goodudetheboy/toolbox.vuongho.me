import { useEffect, useRef, useState, type ReactNode } from 'react';
import add from '../assets/guide/add.webp';
import cram from '../assets/guide/cram.webp';
import hint from '../assets/guide/hint.webp';
import recite from '../assets/guide/recite.webp';
import result from '../assets/guide/result.webp';
import { t } from '../strings';
import { usePet } from './Pettable';
import { Paper, Tape, type TapeColor } from './Scrap';

// "How it works": five swipeable taped cards, one idea each, illustrated with a scrapbook
// collage of the app in use (Gemini, art/guide.sh). Swiping is native horizontal
// scroll-snap; the dots and Next follow the scroll position.

const ART = [add, recite, hint, result, cram];
const TAPES: TapeColor[] = ['pink', 'mint', 'yellow', 'lilac', 'blue'];
const TILTS = [-0.6, 0.5, -0.4, 0.6, -0.5];

/** `**word**` → yellow highlighter; `{said|word}` etc. → the result screen's colors. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|\{(?:said|hinted|missed)\|.+?\})/).map((s, i) => {
    const bold = /^\*\*(.+)\*\*$/.exec(s);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const color = /^\{(\w+)\|(.+)\}$/.exec(s);
    if (color) return <span key={i} className={`guide-word w-${color[1]}`}>{color[2]}</span>;
    return s;
  });
}

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
  const { purring, pet } = usePet();

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
        {cards.map((c, i) => {
          const art = <img className="guide-art" src={ART[i]} alt="" draggable={false} />;
          return (
            <section key={c.title} className="guide-slide" aria-label={t.guide.card(i + 1, cards.length)} aria-hidden={i !== at}>
              <Paper tilt={TILTS[i]} tape={TAPES[i]} className="guide-card">
                {i === last ? (
                  <button type="button" className={`pet guide-pet ${purring ? 'purring' : ''}`} onClick={pet} aria-label={t.petBiggu}>
                    {art}
                  </button>
                ) : (
                  art
                )}
                <div className="guide-note">
                  <span className="guide-step hand" aria-hidden>
                    {i + 1}
                  </span>
                  <Tape color={TAPES[(i + 2) % TAPES.length]} pattern="stripes" width={54} rotate={i % 2 ? 8 : -8} style={{ position: 'absolute', top: -12, right: 18 }} />
                  <h2 className="hand guide-title">{c.title}</h2>
                  <p className="guide-text">{rich(c.text)}</p>
                  {i === last && <p className="guide-purr hand">{t.guide.purr}</p>}
                </div>
              </Paper>
            </section>
          );
        })}
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
