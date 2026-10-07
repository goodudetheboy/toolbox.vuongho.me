import { useEffect, useMemo, useState } from 'react';
import Biggu from '../components/Biggu';
import { ScoreStamp } from '../components/Scrap';
import type { AppUser } from '../lib/types';
import { loadUsage, type UsageData } from '../lib/usage';
import { t } from '../strings';

const DAY = 86_400_000;
const DAYS = 30;

const dayKey = (at: number) => new Date(at).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const shortDay = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const ago = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);

/** Admin Usage tab: sessions over time, per-person totals and the most practiced parts. */
export default function AdminUsage({ user }: { user: AppUser }) {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [who, setWho] = useState<string | null>(null); // null = everyone
  const [picked, setPicked] = useState<number | null>(null); // bar index tapped

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setData(null);
    loadUsage()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const uids = useMemo(() => {
    if (!data) return [];
    const set = new Set([...Object.keys(data.profiles), ...data.notes.map((n) => n.uid), ...data.attempts.map((a) => a.uid)]);
    return [...set];
  }, [data]);

  const name = (uid: string) => {
    if (uid === user.uid) return t.admin.you;
    const p = data?.profiles[uid];
    return p?.name || p?.email || t.admin.who(null, uid);
  };

  const view = useMemo(() => {
    if (!data) return null;
    const mine = <T extends { uid: string }>(xs: T[]) => (who ? xs.filter((x) => x.uid === who) : xs);
    const attempts = mine(data.attempts);
    const notes = mine(data.notes);
    const now = Date.now();
    const last30 = attempts.filter((a) => a.at >= now - DAYS * DAY);

    // One bar per local calendar day, oldest → today.
    const counts = new Map<string, number>();
    for (const a of last30) counts.set(dayKey(a.at), (counts.get(dayKey(a.at)) ?? 0) + 1);
    const days = Array.from({ length: DAYS }, (_, i) => {
      const at = now - (DAYS - 1 - i) * DAY;
      return { at, n: counts.get(dayKey(at)) ?? 0 };
    });

    const topParts = notes
      .flatMap((n) => n.chunks.map((c, i) => ({ n, c, i })))
      .filter((x) => x.c.tries > 0)
      .sort((a, b) => b.c.tries - a.c.tries)
      .slice(0, 5);

    return {
      sessions7: attempts.filter((a) => a.at >= now - 7 * DAY).length,
      sessions30: last30.length,
      activeDays: counts.size,
      avg30: avg(last30.map((a) => a.percent)),
      days,
      max: Math.max(1, ...days.map((d) => d.n)),
      topParts,
    };
  }, [data, who]);

  if (error) {
    return (
      <div className="progress-state">
        <Biggu mood="think" size={110} />
        <p className="error-text">{t.error}</p>
        <button className="btn" onClick={() => setReload((n) => n + 1)}>
          {t.retry}
        </button>
      </div>
    );
  }
  if (!data || !view) {
    return (
      <div className="progress-state">
        <Biggu mood="think" size={110} className="bob" />
      </div>
    );
  }

  const bar = picked !== null ? view.days[picked] : null;

  return (
    <>
      {uids.length > 1 && (
        <div className="chips admin-who">
          {[null, ...uids].map((u) => (
            <button key={u ?? 'all'} className={`chip ${who === u ? 'on' : ''}`} aria-pressed={who === u} onClick={() => setWho(u)}>
              {u ? name(u) : t.admin.everyone}
            </button>
          ))}
        </div>
      )}

      <div className="admin-kpis">
        <div className="stat">
          <span className="stat-num hand">{view.sessions7}</span>
          <span className="stat-label">{t.admin.sessions7}</span>
        </div>
        <div className="stat">
          <span className="stat-num hand">{view.sessions30}</span>
          <span className="stat-label">{t.admin.sessions30}</span>
        </div>
        <div className="stat">
          <span className="stat-num hand">{view.activeDays}</span>
          <span className="stat-label">{t.admin.activeDays}</span>
        </div>
        <div className="stat">
          {view.avg30 === undefined ? <span className="stat-empty">–</span> : <ScoreStamp score={view.avg30} size={58} />}
          <span className="stat-label">{t.admin.avgScore}</span>
        </div>
      </div>

      <section className="admin-card">
        <h3 className="admin-h">{t.admin.perDay}</h3>
        {view.sessions30 === 0 ? (
          <p className="muted">{t.admin.perDayEmpty}</p>
        ) : (
          <>
            <p className="admin-readout" aria-live="polite">
              {bar ? t.admin.sessionsOn(bar.n, shortDay(bar.at)) : `${t.admin.sessions30}: ${view.sessions30}`}
            </p>
            <div className="admin-bars" role="img" aria-label={t.admin.perDay} onMouseLeave={() => setPicked(null)}>
              {view.days.map((d, i) => (
                <button
                  key={d.at}
                  className={`admin-bar ${picked === i ? 'on' : ''}`}
                  aria-label={t.admin.sessionsOn(d.n, shortDay(d.at))}
                  onMouseEnter={() => setPicked(i)}
                  onFocus={() => setPicked(i)}
                  onClick={() => setPicked(picked === i ? null : i)}
                >
                  <span style={{ height: `${(d.n / view.max) * 100}%` }} className={d.n ? '' : 'zero'} />
                </button>
              ))}
            </div>
            <div className="admin-axis">
              <span>{shortDay(view.days[0].at)}</span>
              <span>{view.max}</span>
              <span>{shortDay(view.days[DAYS - 1].at)}</span>
            </div>
          </>
        )}
      </section>

      <section className="admin-card">
        <h3 className="admin-h">{t.admin.people}</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th />
                <th>{t.admin.lastSeen}</th>
                <th>{t.admin.opens}</th>
                <th>{t.admin.notes}</th>
                <th>{t.admin.parts}</th>
                <th>{t.admin.sessions}</th>
                <th>{t.admin.avg}</th>
              </tr>
            </thead>
            <tbody>
              {uids.map((u) => {
                const p = data.profiles[u];
                const notes = data.notes.filter((n) => n.uid === u);
                const attempts = data.attempts.filter((a) => a.uid === u);
                const a = avg(attempts.map((x) => x.percent));
                return (
                  <tr key={u}>
                    <th scope="row">{name(u)}</th>
                    <td title={p ? undefined : t.admin.noProfile}>{p ? ago(p.lastSeenAt) : t.admin.never}</td>
                    <td>{p?.opens ?? t.admin.never}</td>
                    <td>{notes.length}</td>
                    <td>{notes.reduce((s, n) => s + n.chunks.length, 0)}</td>
                    <td>{attempts.length}</td>
                    <td>{a === undefined ? t.admin.never : `${a}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {view.topParts.length > 0 && (
        <section className="admin-card">
          <h3 className="admin-h">{t.admin.topParts}</h3>
          <ol className="admin-top">
            {view.topParts.map(({ n, c, i }) => (
              <li key={`${n.uid}/${n.id}/${i}`}>
                <span className="admin-top-title">
                  {n.title} · {c.title}
                  {!who && uids.length > 1 && <span className="muted"> — {name(n.uid)}</span>}
                </span>
                <b>{t.admin.tries(c.tries)}</b>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
