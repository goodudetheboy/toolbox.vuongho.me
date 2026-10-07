import { useEffect, useState, type FormEvent } from 'react';
import Biggu from '../components/Biggu';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Scrap';
import { addEmail, BUILT_IN_EMAILS, cleanEmail, removeEmail, subscribeAddedEmails } from '../lib/access';
import type { AppUser } from '../lib/types';
import { t } from '../strings';

/** Admin Access tab: which Google accounts can sign in, and adding or removing them. */
export default function AdminAccess({ user }: { user: AppUser }) {
  const [added, setAdded] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [input, setInput] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => subscribeAddedEmails(setAdded, () => setError(true)), []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const email = cleanEmail(input);
    if (!email) return setProblem(t.admin.accessInvalid);
    if (BUILT_IN_EMAILS.includes(email) || added?.includes(email)) return setProblem(t.admin.accessAlready);
    setBusy(true);
    setProblem(null);
    try {
      await addEmail(email, user.email);
      setInput('');
    } catch {
      setProblem(t.error);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="progress-state">
        <Biggu mood="think" size={110} />
        <p className="error-text">{t.error}</p>
      </div>
    );
  }

  return (
    <>
      <form className="admin-card access-add" onSubmit={add} noValidate>
        <label htmlFor="access-email" className="admin-h">
          {t.admin.accessAdd}
        </label>
        <div className="access-row">
          <input
            id="access-email"
            className="text-input"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@gmail.com"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setProblem(null);
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
            {t.admin.accessAddButton}
          </button>
        </div>
        {problem && <p className="error-text access-problem">{problem}</p>}
        <p className="muted access-note">{t.admin.accessNote}</p>
      </form>

      <section className="admin-card">
        <h3 className="admin-h">{t.admin.accessWho}</h3>
        <ul className="access-list">
          {BUILT_IN_EMAILS.map((e) => (
            <li key={e}>
              <span className="access-email">{e}</span>
              <span className="access-tag">{t.admin.accessBuiltIn}</span>
            </li>
          ))}
          {added === null ? (
            <li className="muted">…</li>
          ) : (
            added.map((e) => (
              <li key={e}>
                <span className="access-email">{e}</span>
                <button className="text-btn danger" onClick={() => setRemoving(e)} aria-label={t.admin.accessRemove(e)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <ConfirmDialog
        open={removing !== null}
        title={t.admin.accessRemoveTitle}
        message={removing ? t.admin.accessRemoveBody(removing) : ''}
        confirmLabel={t.admin.accessRemoveButton}
        danger
        onConfirm={async () => {
          if (removing) await removeEmail(removing, user.email);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
