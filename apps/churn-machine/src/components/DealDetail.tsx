// One deal, laid out like a stock page: hero number, key statistics, then
// sections. Used by the modal (sheet) and the full page.
import type { Deal } from '../lib/types';
import { ASSUMED, dealStatus, keepOpenDays, laterTotal, usd, valueOf } from '../lib/value';
import { shortDate } from '../lib/dates';
import { StatusTag, VerdictTag } from './bits';

const PULL: Record<Deal['pull'], string> = { soft: 'Soft pull', hard: 'Hard pull', mixed: 'Mixed reports', unknown: 'Unknown' };

/** The post's own wording, when it adds something beyond our summary. */
function Raw({ text }: { text: string | null }) {
  if (!text || /^(yes|no|none|none listed|unknown|nationwide)\.?$/i.test(text.trim())) return null;
  return <div className="raw">“{text}”</div>;
}

function ddLine(d: Deal): string {
  if (d.dd.required === false) return 'Not required';
  if (d.dd.required == null) return 'See post';
  const amt = d.dd.amount ? `${usd(d.dd.amount)} total` : 'Any amount';
  const parts = [amt];
  if (d.dd.monthly && d.dd.months) parts.push(`spread over ${d.dd.months} months`);
  if (d.dd.minDeposits && d.dd.minDeposits > 1) parts.push(`at least ${d.dd.minDeposits} deposits`);
  parts.push(d.dd.windowDays ? `within ${d.dd.windowDays} days` : 'window: see post');
  return parts.join(', ');
}

function ddShort(d: Deal): string {
  if (d.dd.required === false) return 'None';
  if (d.dd.required == null) return 'See post';
  const amt = d.dd.amount ? usd(d.dd.amount) : 'Any';
  return d.dd.windowDays ? `${amt} in ${d.dd.windowDays}d` : d.dd.monthly && d.dd.months ? `${amt} / ${d.dd.months} mo` : amt;
}

function bonusRange(d: Deal): string {
  if (d.bonusMin != null && d.bonusMax != null && d.bonusMin !== d.bonusMax) return `${usd(d.bonusMin)} – ${usd(d.bonusMax)}`;
  return d.bonusMax != null ? usd(d.bonusMax) : 'See post';
}

export function DealHero({ deal: d, today, baselineApy }: { deal: Deal; today: string; baselineApy: number }) {
  const v = valueOf(d, baselineApy);
  return (
    <div className="hero">
      <div className="hero-kicker">{d.title}</div>
      <h1 className="hero-name">{d.bank}</h1>
      <div className="hero-number">{d.bonusMax != null ? usd(d.bonusMax) : '?'}</div>
      {d.termsChecked && d.bonusListed != null && d.bonusListed !== d.bonusMax && (
        <div className="hero-listed">
          {!d.bonusMax
            ? `Listed as ${usd(d.bonusListed)}, but it’s all paid out over a year or more, so none of it is counted.`
            : `Listed as ${usd(d.bonusListed)}. ${usd(d.bonusMax)} is what you get once the sign-up requirements are done${laterTotal(d) > 0 ? `; ${usd(laterTotal(d))} more takes a year or more and isn’t counted` : ''}.`}
        </div>
      )}
      <div className={`hero-delta ${v.net > 0 ? 'up' : 'down'}`}>
        {usd(v.net)} net after costs <span className="hero-dot">·</span> <VerdictTag verdict={v.verdict} />
      </div>
      <div className="hero-status"><StatusTag deal={d} today={today} /></div>
    </div>
  );
}

export function KeyStats({ deal: d, baselineApy }: { deal: Deal; baselineApy: number }) {
  const v = valueOf(d, baselineApy);
  const stats: [string, string][] = [
    [d.termsChecked ? 'Upfront bonus' : 'Bonus', bonusRange(d)],
    ['Direct deposit', ddShort(d)],
    ['Park cash', d.balance ? usd(d.balance.amount) : 'None'],
    ['Transactions', d.transactions != null ? String(d.transactions) : 'None listed'],
    ['Keep open', `${d.eatf.days ?? keepOpenDays(d)} days${d.eatf.days ? '' : '*'}`],
    ['Credit pull', PULL[d.pull]],
    ['Bonus posts', d.payoutDays ? `~${d.payoutDays} days` : 'See post'],
    ['Effective APY', v.effectiveApy != null ? `${(v.effectiveApy * 100).toFixed(1)}%` : '–'],
  ];
  return (
    <section className="section">
      <h2>Key statistics</h2>
      <dl className="stats">
        {stats.map(([k, val]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
      {!d.eatf.days && <p className="footnote">* Assumed, the post doesn’t say.</p>}
    </section>
  );
}

/** Everything below the key statistics. */
export function DealSections({ deal: d, today, baselineApy, full = false }: {
  deal: Deal;
  today: string;
  baselineApy: number;
  /** Full page: also show the index's at-a-glance lines. */
  full?: boolean;
}) {
  const v = valueOf(d, baselineApy);
  const status = dealStatus(d, today);
  return (
    <>
      {status === 'date-passed' && (
        <div className="notice">
          The listed end date ({shortDate(d.expires!, today)}) has passed, but Doctor of Credit still lists this deal. Check the post before acting.
        </div>
      )}
      {d.latestNote && <div className="callout">{d.latestNote}</div>}

      <section className="section">
        <h2>Is it worth it?</h2>
        <div className="summary-rows">
          <div><span>Bonus</span><span>{usd(v.bonus)}</span></div>
          {v.capitalCost > 0 && (
            <div>
              <span>Interest you’d skip on parked cash <span className="faint">({Math.round(baselineApy * 1000) / 10}% APY)</span></span>
              <span>−{usd(v.capitalCost)}</span>
            </div>
          )}
          {v.feeCost > 0 && <div><span>Unavoidable fees</span><span>−{usd(v.feeCost)}</span></div>}
          <div className="total"><span>You keep about</span><span className={v.net > 0 ? 'up' : 'down'}>{usd(v.net)}</span></div>
        </div>
        {v.effortNotes.length > 0 && <p className="muted">Effort: {v.effortNotes.join(', ')}.</p>}
      </section>

      {full && d.blurb.length > 0 && (
        <section className="section">
          <h2>At a glance</h2>
          <ul className="bullets">{d.blurb.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}

      {d.requirements.length > 0 && (
        <section className="section">
          <h2>About this offer</h2>
          <ul className="bullets">{d.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </section>
      )}

      <section className="section">
        <h2>Details</h2>
        <dl className="facts">
          <dt>Bonus</dt>
          <dd>
            {bonusRange(d)}
            {d.bonusNote && <span className="muted"> · {d.bonusNote}</span>}
            {d.bonusHow && <div className="raw">Upfront for: {d.bonusHow}.</div>}
            {laterTotal(d) > 0 && (
              <div className="later">
                <b>Later, not counted ({usd(laterTotal(d))}):</b>
                <ul>{d.later!.map((l, i) => <li key={i}>{usd(l.amount)}: {l.how}</li>)}</ul>
              </div>
            )}
            {d.termsChecked === false && <div className="raw">These terms changed since they were last checked by hand, so the numbers are the automatic read. Check the post.</div>}
            {d.bonusPostMax != null && (
              <div className="raw">The post’s terms are for {usd(d.bonusPostMax)}, so value and plans count that. The higher amount may be a newer or portal offer; check the post.</div>
            )}
          </dd>
          <dt>Direct deposit</dt>
          <dd>{ddLine(d)}<Raw text={d.ddText} /></dd>
          {d.balance && (
            <>
              <dt>Park cash</dt>
              <dd>{usd(d.balance.amount)} for {d.balance.holdDays ? `${d.balance.holdDays} days` : `~${ASSUMED.holdDays} days (assumed)`}</dd>
            </>
          )}
          {d.transactions != null && (<><dt>Transactions</dt><dd>{d.transactions}</dd></>)}
          {d.extraReqText && !/^(see below|none|unknown|n\/a)\.?$/i.test(d.extraReqText.trim()) && (<><dt>Also</dt><dd>{d.extraReqText}</dd></>)}
          {d.promoCode && (<><dt>Promo code</dt><dd><span className="code">{d.promoCode}</span></dd></>)}
          <dt>Ends</dt>
          <dd><StatusTag deal={d} today={today} /><Raw text={d.expirationText} /></dd>
          <dt>Where</dt>
          <dd>
            {d.nationwide ? 'Nationwide' : d.states.join(', ') || 'See post'}
            {d.inBranch && <span className="tag warn"> · in branch</span>}
            {d.availability && <Raw text={d.availability} />}
          </dd>
          <dt>Credit pull</dt>
          <dd>{PULL[d.pull]}<Raw text={d.pullText && !/^soft( pull)?$|^hard( pull)?$/i.test(d.pullText) ? d.pullText : null} /></dd>
          <dt>ChexSystems</dt>
          <dd>{d.chexText ?? 'Unknown'}</dd>
          <dt>Card funding</dt>
          <dd>{d.ccFunding ? `Up to ${usd(d.ccFunding)}` : d.ccFunding === 0 ? 'No' : 'Unknown'}<Raw text={d.ccText && d.ccFunding ? d.ccText : null} /></dd>
          <dt>Monthly fee</dt>
          <dd>{d.monthlyFeeText ?? 'Unknown'}</dd>
          <dt>Keep open</dt>
          <dd>
            {d.eatf.days ? `${d.eatf.days} days` : `${keepOpenDays(d)} days (assumed)`}
            {d.eatfText && <Raw text={d.eatfText} />}
          </dd>
          <dt>Bonus posts</dt>
          <dd>{d.payoutDays ? `Within ~${d.payoutDays} days of meeting it` : 'See post'}</dd>
          {d.householdText && (<><dt>Household limit</dt><dd>{d.householdText}</dd></>)}
        </dl>
      </section>

      {d.verdict.length > 0 && (
        <section className="section">
          <h2>Doctor of Credit’s take</h2>
          {d.verdict.map((l, i) => <p key={i} className="prose">{l}</p>)}
        </section>
      )}
      {d.postUpdated && <p className="footnote">Post last updated {shortDate(d.postUpdated, today)}.</p>}
    </>
  );
}

/** The "order panel": the numbers that matter and what to do next. */
export function ActionCard({ deal: d, today, baselineApy, actions, extra }: {
  deal: Deal;
  today: string;
  baselineApy: number;
  actions?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const v = valueOf(d, baselineApy);
  return (
    <div className="card action-card">
      <h3>Open at {d.bank}</h3>
      <div className="summary-rows">
        <div><span>Bonus</span><span>{d.bonusMax != null ? usd(d.bonusMax) : '?'}</span></div>
        <div><span>Ends</span><span><StatusTag deal={d} today={today} /></span></div>
        {d.promoCode && <div><span>Promo code</span><span className="code">{d.promoCode}</span></div>}
        <div className="total"><span>Net value</span><span className={v.net > 0 ? 'up' : 'down'}>{usd(v.net)}</span></div>
      </div>
      <div className="card-actions">
        {actions}
        {d.url && <a className="btn outline block" href={d.url} target="_blank" rel="noreferrer">Read the post on Doctor of Credit ↗</a>}
        {extra}
      </div>
      {(d.offerLink || d.otherPosts.length > 0) && (
        <div className="card-links">
          {d.offerLink && <a href={d.offerLink} target="_blank" rel="noreferrer">Bank’s offer page ↗</a>}
          {d.otherPosts.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">Related post {i + 1} ↗</a>)}
        </div>
      )}
    </div>
  );
}
