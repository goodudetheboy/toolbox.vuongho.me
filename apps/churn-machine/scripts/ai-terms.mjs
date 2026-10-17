// Gemini reads a deal's terms when they're new or changed since the last check
// (data/deal-terms.json), the same way they were read by hand: what you get once
// the sign-up requirements are done, what that takes, money that needs a year or
// more ("later", never counted), and other requirements ("extras").
// See docs/adr/0013-gemini-checks-changed-deal-terms.md.
//
// Called through Vertex AI in the shared `vuonghome` project, so CI needs no API
// key: the token comes from GEMINI_TOKEN, or `gcloud auth print-access-token`.

import { execSync } from 'node:child_process';
import { dollars } from './parse-deals.mjs';

const PROJECT = 'vuonghome';
export const MODEL = process.env.CHURN_GEMINI_MODEL || 'gemini-3.8-flash';
const URL = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`;
export const vertexUrl = () => URL;
const MAX_CHARS = 16000;

let token = process.env.GEMINI_TOKEN || null;
/** A Vertex AI access token, or null when there's no way to get one (no AI check then). */
export function aiToken() {
  if (token) return token;
  try {
    token = execSync('gcloud auth print-access-token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    token = null;
  }
  return token;
}

const PROMPT = `You read US bank account bonus offers from Doctor of Credit and extract what the bonus really pays and what it takes.

Which offer to read:
- The current terms are in "The Offer" section and its fine print. The "Update ..." notes at the top are history (old amounts, past extensions, other or targeted offers): ignore them unless there is no Offer section.
- Read only the offer the title names. Ignore referral bonuses, other account types, and other products the title doesn't name. When the title names several parts (e.g. "$300 checking + $200 savings"), add them up.

Rules:
- "upfront": dollars you get once the sign-up requirements are done, within the deal's initial window (at most about 6 months after opening). For tiered offers, use the TOP tier and give that tier's requirements. When the title's amount and the Offer section differ, trust the Offer section (the title can include later money). Points or miles: value at 1 cent each.
- "later": money that needs 12+ months of keeping deposits or balances going, including monthly drips that run 12+ months (e.g. "$25 a month for 12 months"). Each item: amount and a short "how". If ALL the money is like that, upfront is 0.
- "how": one short sentence (no trailing period) of what earns the upfront bonus, e.g. "$1,000+ in direct deposits within 90 days".
- "dd": direct deposit needed for the upfront bonus. total = total dollars of direct deposit needed across the window (e.g. two $2,500 deposits = 5000; $500 a month for 3 months = 1500). windowDays = days after opening to complete it. deposits = number of separate deposits required, if stated. months = number of consecutive months, if it's a monthly requirement. required=false when no direct deposit is needed.
- "bal": new money to deposit and keep, needed for the upfront bonus (not a small minimum balance under $1,000). amount and holdDays (days it must stay). required=false if none.
- "tx": number of debit card purchases/transactions required, 0 if none.
- "extras": every other requirement besides direct deposit and parked cash, each a short plain phrase with its window, e.g. "10 debit card purchases within 60 days", "Enroll in eStatements", "Keep the account open 6 months". Include the debit purchases here too. No em dashes.
- "fee": the monthly maintenance fee of the account that earns the upfront bonus (for tiered offers, the top tier's account), usually in the "Avoiding Fees" / "Monthly Fees" section. monthly = the fee after anything costless like eStatements (0 if none). freeMonths = months with no fee at the start (e.g. "waived for the first two statement periods" = 2). waivers = every realistic way to waive it: kind "dd" (direct deposits totaling amount a month), "bal" (keep amount in the account or combined balances), "tx" (count card purchases or similar a month; how = short phrase), "free" (something costless like eStatements or one deposit a month; how = short phrase). Skip waivers like age, military, mortgages, credit cards or merchant services. once = a one-time fee (membership, joining donation), else null.
- Only use what the text says. Don't invent numbers. Use null where unknown.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    upfront: { type: 'INTEGER' },
    how: { type: 'STRING' },
    dd: {
      type: 'OBJECT',
      properties: {
        required: { type: 'BOOLEAN' },
        total: { type: 'INTEGER', nullable: true },
        windowDays: { type: 'INTEGER', nullable: true },
        deposits: { type: 'INTEGER', nullable: true },
        months: { type: 'INTEGER', nullable: true },
      },
      required: ['required'],
    },
    bal: {
      type: 'OBJECT',
      properties: {
        required: { type: 'BOOLEAN' },
        amount: { type: 'INTEGER', nullable: true },
        holdDays: { type: 'INTEGER', nullable: true },
      },
      required: ['required'],
    },
    tx: { type: 'INTEGER' },
    later: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { amount: { type: 'INTEGER' }, how: { type: 'STRING' } }, required: ['amount', 'how'] },
    },
    extras: { type: 'ARRAY', items: { type: 'STRING' } },
    fee: {
      type: 'OBJECT',
      properties: {
        monthly: { type: 'NUMBER' },
        freeMonths: { type: 'INTEGER' },
        waivers: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              kind: { type: 'STRING', enum: ['dd', 'bal', 'tx', 'free'] },
              amount: { type: 'INTEGER', nullable: true },
              count: { type: 'INTEGER', nullable: true },
              how: { type: 'STRING', nullable: true },
            },
            required: ['kind'],
          },
        },
        once: { type: 'OBJECT', nullable: true, properties: { amount: { type: 'NUMBER' }, how: { type: 'STRING' } } },
      },
      required: ['monthly', 'freeMonths', 'waivers'],
    },
  },
  required: ['upfront', 'how', 'dd', 'bal', 'tx', 'later', 'extras', 'fee'],
};

/** The text Gemini reads: the index entry plus the post. */
export function dealText(entry, postLines) {
  const text = [`Title: ${entry.title}`, ...entry.blurb, '', ...postLines].join('\n');
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

const posInt = (n) => Number.isInteger(n) && n > 0;
const clean = (s) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().replace(/\.$/, '');

/**
 * Turns Gemini's answer into a deal-terms entry, or throws when it doesn't hold
 * up (the deal then stays unchecked rather than showing a guess).
 */
export function toEntry(ans, text) {
  const amounts = [...new Set(dollars(text))];
  const inText = new Set(amounts);
  if (!Number.isInteger(ans.upfront) || ans.upfront < 0) throw new Error(`bad upfront ${ans.upfront}`);
  // Points/miles at 1¢ each.
  const points = new Set((text.match(/\b\d{1,3}(?:,\d{3})+|\b\d{4,7}\b/g) ?? []).map((m) => Number(m.replace(/,/g, '')) / 100));
  // Not made up: the amount is in the post, two of its amounts added up (checking + savings), or points.
  const madeOf = (n) => n === 0 || inText.has(n) || points.has(n) || amounts.some((a) => inText.has(n - a));
  if (!madeOf(ans.upfront)) throw new Error(`upfront ${ans.upfront} isn't in the post`);
  const entry = { upfront: ans.upfront, how: clean(ans.how) || undefined };

  if (!ans.dd?.required) entry.dd = 0;
  else if (posInt(ans.dd.total)) {
    const { total, windowDays, deposits, months } = ans.dd;
    if (windowDays != null && !(posInt(windowDays) && windowDays <= 400)) throw new Error(`bad DD window ${windowDays}`);
    entry.dd = [total, windowDays ?? null, posInt(deposits) ? deposits : null, posInt(months) ? months : null];
  } else entry.dd = null; // required but no amount: keep the parser's read

  if (!ans.bal?.required) entry.bal = 0;
  else if (posInt(ans.bal.amount)) {
    if (!inText.has(ans.bal.amount)) throw new Error(`balance ${ans.bal.amount} isn't in the post`);
    entry.bal = [ans.bal.amount, posInt(ans.bal.holdDays) ? ans.bal.holdDays : null];
  } else entry.bal = null;

  entry.tx = Number.isInteger(ans.tx) && ans.tx >= 0 ? ans.tx : null;
  entry.later = (ans.later ?? []).filter((l) => posInt(l.amount)).map((l) => ({ amount: l.amount, how: clean(l.how) }));
  entry.extras = (ans.extras ?? []).map(clean).filter(Boolean);
  const fee = feeEntry(ans.fee, inText);
  if (fee) entry.fee = fee;
  if (!entry.later.length) delete entry.later;
  if (!entry.extras.length) delete entry.extras;
  if (!entry.how) delete entry.how;
  return entry;
}

/** The compact fee entry (see deal-terms.mjs), or null for no fee; waivers whose amount isn't in the post are dropped. */
export function feeEntry(f, inText) {
  if (!f) return null;
  const monthly = Number.isFinite(f.monthly) && f.monthly > 0 && f.monthly < 100 ? Math.round(f.monthly * 100) / 100 : 0;
  const w = (f.waivers ?? []).flatMap((x) => {
    if ((x.kind === 'dd' || x.kind === 'bal') && posInt(x.amount) && inText.has(x.amount)) return [[x.kind, x.amount]];
    if (x.kind === 'tx' && posInt(x.count) && x.how) return [['tx', x.count, clean(x.how)]];
    if (x.kind === 'free' && x.how) return [['free', clean(x.how)]];
    return [];
  });
  const once = f.once && f.once.amount > 0 && f.once.amount < 200 ? [f.once.amount, clean(f.once.how) || 'one-time fee'] : null;
  if (!monthly && !once && !w.length) return null;
  const out = { m: monthly };
  if (posInt(f.freeMonths) && f.freeMonths <= 12) out.free = f.freeMonths;
  if (w.length) out.w = w;
  if (once) out.once = once;
  return out;
}

/** Asks Gemini for a deal's terms. Returns the raw answer. */
export async function askGemini(text) {
  const t = aiToken();
  if (!t) throw new Error('no Vertex AI token');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const out = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
      if (!out) throw new Error('empty answer');
      return JSON.parse(out);
    }
    if (attempt >= 3 || ![429, 500, 503].includes(res.status)) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}
