import type { WordStatus } from '../lib/useRecitation';
import type { Token } from '../lib/words';
import { t } from '../strings';
import { Paper } from './Scrap';

/** The part's text with every word colored Got it / Hinted / Missed, plus a legend of the colors used. */
export default function MarkedWords({ tokens, statuses, tilt = -0.4 }: { tokens: Token[]; statuses: WordStatus[]; tilt?: number }) {
  const lines: { word: string; status: WordStatus }[][] = [];
  tokens.forEach((tk, i) => {
    (lines[tk.line] ??= []).push({ word: tk.display, status: statuses[i] });
  });

  return (
    <>
      {/* Only the colors that actually appear get a label. */}
      <div className="legend">
        {(['said', 'hinted', 'missed'] as const)
          .filter((k) => statuses.includes(k))
          .map((k) => (
            <span key={k} className={`lg ${k}`}>
              {t[k]}
            </span>
          ))}
      </div>

      <Paper tilt={tilt} lined className="result-card">
        {lines.map((line, li) => (
          <p key={li} className="result-line">
            {line.map((w, wi) => (
              <span key={wi} className={`w w-${w.status}`}>
                {w.word}{' '}
              </span>
            ))}
          </p>
        ))}
      </Paper>
    </>
  );
}
