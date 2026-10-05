import type { ReactNode } from 'react';

/** Above this many characters the title steps down a size, so two lines still read as a heading. */
const LONG = 22;

/**
 * Top-bar title for a part: up to two lines (then "…") with a pill underneath.
 * The top bar pins its buttons to the top while this is in it, so they don't
 * shift between parts with short and long titles.
 */
export default function PartTitle({ title, pill }: { title: string; pill: ReactNode }) {
  return (
    <span className="study-title">
      <span className={`hand study-title-text ${title.length > LONG ? 'long' : ''}`}>{title}</span>
      <span className="part-pill">{pill}</span>
    </span>
  );
}
