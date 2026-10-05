import { useState } from 'react';
import { DOWN_REASONS, type DownReason, type Rating } from '../lib/feedback';
import { t } from '../strings';
import { BigguFace } from './Scrap';

/**
 * "How was this session?" happy / sad Biggu on the result screen. Happy saves straight away;
 * sad asks what felt off (chips + optional note). Either can be changed afterwards.
 */
export default function SessionFeedback({
  onSave,
}: {
  onSave: (rating: Rating, reasons: DownReason[], comment: string) => Promise<void>;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [reasons, setReasons] = useState<DownReason[]>([]);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'asking' | 'details' | 'saving' | 'saved' | 'error'>('asking');

  async function save(r: Rating, rs: DownReason[], c: string) {
    setState('saving');
    try {
      await onSave(r, rs, c);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  function pick(r: Rating) {
    setRating(r);
    if (r === 'up') {
      setReasons([]);
      void save('up', [], comment);
    } else {
      setState('details');
    }
  }

  const toggle = (r: DownReason) => setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  return (
    <section className="feedback" aria-label={t.feedbackQuestion}>
      <div className="feedback-row">
        <span className="feedback-q">{state === 'saved' ? t.feedbackThanks : t.feedbackQuestion}</span>
        <span className="feedback-thumbs">
          {(['up', 'down'] as const).map((r) => (
            <button
              key={r}
              className={`thumb thumb-${r} ${rating === r ? 'on' : ''}`}
              aria-label={r === 'up' ? t.feedbackGood : t.feedbackBad}
              aria-pressed={rating === r}
              disabled={state === 'saving'}
              onClick={() => pick(r)}
            >
              <BigguFace mood={r === 'up' ? 'happy' : 'sad'} />
            </button>
          ))}
        </span>
      </div>

      {state === 'details' && (
        <form
          className="feedback-details"
          onSubmit={(e) => {
            e.preventDefault();
            void save('down', reasons, comment);
          }}
        >
          <p className="feedback-sub">{t.feedbackWhat}</p>
          <div className="chips">
            {DOWN_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip ${reasons.includes(r) ? 'on' : ''}`}
                aria-pressed={reasons.includes(r)}
                onClick={() => toggle(r)}
              >
                {t.feedbackReason[r]}
              </button>
            ))}
          </div>
          <textarea
            className="feedback-comment"
            rows={2}
            maxLength={500}
            placeholder={t.feedbackCommentPlaceholder}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="feedback-actions">
            <button type="submit" className="btn btn-primary">
              {t.feedbackSend}
            </button>
          </div>
        </form>
      )}

      {state === 'error' && <p className="error-text">{t.error}</p>}
    </section>
  );
}
