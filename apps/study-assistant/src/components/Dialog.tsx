import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { t } from '../strings';
import Biggu, { type BigguMood } from './Biggu';
import { Paper } from './Scrap';

// Our own modal (never window.prompt/confirm): a taped paper card with Biggu
// peeking over the top. Built on <dialog>.showModal() for the backdrop, focus
// trap and Esc-to-cancel; everything visible is styled to match the app.

export function Modal({
  open,
  mood,
  title,
  children,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  mood: BigguMood;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // A click on the backdrop lands on the <dialog> itself, not the card.
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      {open && (
        <div className="modal-wrap">
          <Biggu mood={mood} size={92} className="modal-biggu" />
          <Paper tilt={-1} tape="yellow" className="modal-card">
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <h2 className="hand modal-title">{title}</h2>
              {children}
            </form>
          </Paper>
        </div>
      )}
    </dialog>
  );
}

/** Runs an async action, exposing whether it's still in flight. */
function useBusy(action: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Yes/no question. `danger` paints the confirm button coral (for deletes). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  mood = 'think',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  mood?: BigguMood;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const { busy, run } = useBusy(onConfirm);
  return (
    <Modal open={open} mood={mood} title={title} onCancel={() => !busy && onCancel()} onSubmit={() => void run()}>
      {message && <p className="modal-message">{message}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t.cancel}
        </button>
        {/* showModal() focuses Cancel (first button), so a stray Enter never deletes. */}
        <button type="submit" className={`btn ${danger ? 'btn-stop' : 'btn-primary'}`} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Asks for one line of text, pre-filled with `initial`. Saving an unchanged value just closes. */
export function PromptDialog({
  open,
  title,
  label,
  initial,
  confirmLabel,
  mood = 'think',
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  mood?: BigguMood;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const trimmed = value.trim();
  const { busy, run } = useBusy(() => (trimmed !== initial ? onSubmit(trimmed) : onCancel()));

  return (
    <Modal open={open} mood={mood} title={title} onCancel={() => !busy && onCancel()} onSubmit={() => trimmed && void run()}>
      <label className="modal-field">
        <span className="modal-label">{label}</span>
        <input
          className="text-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          autoFocus
          maxLength={120}
        />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !trimmed}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
