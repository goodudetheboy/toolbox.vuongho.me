import type { Deal } from '../lib/types';
import { ASSUMED, dealStatus, keepOpenDays, usd, valueOf } from '../lib/value';
import { shortDate } from '../lib/dates';
import { StatusTag } from './bits';

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

export function DealDetail({ deal: d, today, baselineApy, actions }: {
  deal: Deal;
  today: string;
  baselineApy: number;
  actions?: React.ReactNode;
}) {
  const v = valueOf(d, baselineApy);
  const status = dealStatus(d, today);
  return (
    <div className="detail">
      {d.latestNote && <p className="note">{d.latestNote}</p>}
      {status === 'date-passed' && (
        <div className="notice">
          The listed end date ({shortDate(d.expires!, today)}) has passed, but Doctor of Credit still lists this deal. Check the post before acting.
        </div>
      )}

      <h3>Worth it?</h3>
      <div className="worth">
        Net about <b>{usd(v.net)}</b>
        <span className="meta">
          {' '}= {usd(v.bonus)} bonus
          {v.capitalCost > 0 && <> − {usd(v.capitalCost)} interest you’d skip on the parked cash ({Math.round(baselineApy * 1000) / 10}% APY)</>}
          {v.feeCost > 0 && <> − {usd(v.feeCost)} unavoidable fees</>}
        </span>
        {v.effectiveApy != null && (
          <div className="meta">That’s like a {(v.effectiveApy * 100).toFixed(1)}% APY on {usd(d.balance!.amount)}.</div>
        )}
        {v.effortNotes.length > 0 && <div className="meta">Effort: {v.effortNotes.join(', ')}.</div>}
      </div>

      {d.requirements.length > 0 && (
        <>
          <h3>The offer</h3>
          <ul>{d.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </>
      )}

      <h3>Details</h3>
      <dl className="facts">
        <dt>Bonus</dt>
        <dd>
          {d.bonusMin != null && d.bonusMax != null && d.bonusMin !== d.bonusMax ? `${usd(d.bonusMin)} – ${usd(d.bonusMax)}` : d.bonusMax != null ? usd(d.bonusMax) : 'See post'}
          {d.bonusNote && <span className="meta"> · {d.bonusNote}</span>}
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

      {d.verdict.length > 0 && (
        <>
          <h3>Doctor of Credit’s take</h3>
          {d.verdict.map((l, i) => <p key={i} style={{ margin: '4px 0' }}>{l}</p>)}
        </>
      )}

      <div className="links">
        {d.url && <a className="doc-link" href={d.url} target="_blank" rel="noreferrer">Read the full post on Doctor of Credit ↗</a>}
        {d.offerLink && <a href={d.offerLink} target="_blank" rel="noreferrer">Bank’s offer page ↗</a>}
        {d.otherPosts.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">Related post {i + 1} ↗</a>)}
        <span className="grow" />
        {actions}
      </div>
      {d.postUpdated && <div className="meta" style={{ marginTop: 8 }}>Post last updated {shortDate(d.postUpdated, today)}.</div>}
    </div>
  );
}
