import { useEffect, useState } from 'react';
import Biggu from '../components/Biggu';
import { listAllMessages, type Message } from '../lib/messages';
import type { AppUser } from '../lib/types';
import { t } from '../strings';

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Admin Messages tab: everything sent from "Send feedback", newest first. */
export default function AdminMessages({ user }: { user: AppUser }) {
  const [list, setList] = useState<{ uid: string; message: Message }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAllMessages()
      .then((l) => !cancelled && setList(l))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="progress-state">
        <Biggu mood="think" size={110} />
        <p className="error-text">{t.error}</p>
      </div>
    );
  }
  if (!list) {
    return (
      <div className="progress-state">
        <Biggu mood="think" size={110} className="bob" />
      </div>
    );
  }
  if (list.length === 0) return <p className="muted history-empty">{t.admin.noMessages}</p>;

  return (
    <ol className="message-list">
      {list.map(({ uid, message: m }, i) => (
        <li key={`${uid}-${m.createdAt}-${i}`} className="admin-card">
          <div className="message-head">
            <span className={`message-kind ${m.kind}`}>{t.messageKinds[m.kind] ?? m.kind}</span>
            <span className="muted">
              {uid === user.uid ? t.admin.you : m.name || m.email || t.admin.who(null, uid)} · {when(m.createdAt)}
            </span>
          </div>
          <p className="message-body">{m.text}</p>
          <p className="muted message-ua">{m.userAgent}</p>
        </li>
      ))}
    </ol>
  );
}
