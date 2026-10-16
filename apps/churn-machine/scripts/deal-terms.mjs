// Hand-checked deal terms (data/deal-terms.json): for every deal, what you get
// once the sign-up requirements are done ("upfront"), what that takes, and any
// money that needs a year or more of keeping deposits or balances going
// ("later", never counted in values or plans). The regex parser can't tell
// those apart, so these were read deal by deal, once, on 2026-10-16.
// See docs/adr/0012-hand-checked-deal-terms.md.
//
// Each entry carries a hash of the deal's terms text. When DoC rewrites a
// deal's terms the hash stops matching and the deal falls back to the parser
// (marked unchecked), rather than showing stale numbers.

import { createHash } from 'node:crypto';

/** Hash of the text the terms were read from. */
export function termsHash(deal) {
  const text = [
    deal.title,
    deal.bonusText,
    ...(Array.isArray(deal.requirements) ? deal.requirements : []),
    deal.ddText,
    deal.extraReqText,
  ].map((s) => (s ?? '').replace(/\s+/g, ' ').trim()).join('\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const NO_DD = { required: false, amount: 0, windowDays: null, monthly: false, months: null, minDeposits: null };

/**
 * A parsed deal with its checked terms applied (or marked unchecked).
 * `entry` fields: upfront, how, dd ([total, windowDays, deposits, months],
 * 0 = none, null = keep the parser's), bal ([amount, holdDays], 0 = none,
 * null = keep), tx (count, 0 = none, null = keep), later [{amount, how}].
 */
export function applyTerms(deal, entry) {
  if (!entry || entry.hash !== termsHash(deal)) return { ...deal, termsChecked: false, later: [] };
  const out = {
    ...deal,
    termsChecked: true,
    // What the post headlines (may include later money or a different tier).
    bonusListed: deal.bonusPostMax ?? deal.bonusMax,
    bonusMax: entry.upfront,
    bonusMin: Math.min(deal.bonusMin ?? entry.upfront, entry.upfront),
    bonusPostMax: null,
    bonusHow: entry.how ?? null,
    later: entry.later ?? [],
  };
  if (entry.dd === 0) out.dd = NO_DD;
  else if (Array.isArray(entry.dd)) {
    const [total, windowDays, deposits, months] = entry.dd;
    out.dd = {
      required: true,
      amount: total,
      windowDays: windowDays ?? deal.dd.windowDays,
      monthly: !!months,
      months: months ?? null,
      minDeposits: deposits ?? null,
    };
  }
  if (entry.bal === 0) out.balance = null;
  else if (Array.isArray(entry.bal)) out.balance = { amount: entry.bal[0], holdDays: entry.bal[1] };
  if (entry.tx === 0) out.transactions = null;
  else if (typeof entry.tx === 'number') out.transactions = entry.tx;
  return out;
}
