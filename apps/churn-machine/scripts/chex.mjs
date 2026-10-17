// How sensitive each bank is to recently opened accounts (ChexSystems / Early
// Warning Services inquiries), by bank: data/chex.json. See
// docs/adr/0016-chexsystems-in-plans.md.
//
// - Hand entries: made from Doctor of Credit's lists on 2026-10-17. Never
//   overwritten.
// - Once a month (with ADR 0013's terms check), Gemini reads Doctor of
//   Credit's two lists (inquiry-sensitive banks, banks that check EWS) when
//   they've changed, and matches our banks to them: one call.
// - Banks still unknown: a quick pass searches the web and quotes what people
//   report, then a careful pass reads only those quotes and decides.
//   Re-checked after RECHECK_DAYS.
//
// Entry: { s: true | false | null (sensitive / not / unknown), lim: [[accounts,
// months], ...] (reported denials: that many new accounts within that many
// months), note, ews (checks Early Warning Services), by: "gemini", on, from:
// "doc-list" | "web", src }. The key "_lists" remembers when the lists were read.

import { readFileSync, writeFileSync } from 'node:fs';
import { aiToken, MODEL, vertexUrl } from './ai-terms.mjs';
import { htmlToLines } from './parse-deals.mjs';

export const bankKey = (b) => b.toLowerCase().replace(/[^a-z0-9]/g, '');
/**
 * The web search pass: the same model with little thinking, only finding and
 * quoting (~10 s; flash-lite was faster but found nothing). The careful read
 * of the quotes is a separate call with normal thinking.
 */
export const SEARCH_MODEL = process.env.CHURN_SEARCH_MODEL || MODEL;
export const LIST_SLUGS = { sensitive: 'banks-credit-unions-chexsystems-inquiry-sensitive', ews: 'banks-credit-unions-dodont-pull-early-warning-services' };

export function readChex(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeChex(file, data) {
  const ids = Object.keys(data).sort();
  writeFileSync(file, `{\n${ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(data[id])}`).join(',\n')}\n}\n`);
}

/** The deal with its bank's entry applied (`chex`), and `chexSensitive` set when either source says so. */
export function applyChex(deal, data) {
  const e = data[bankKey(deal.bank)];
  if (!e) return { ...deal, chex: null };
  return {
    ...deal,
    chexSensitive: deal.chexSensitive || e.s === true,
    chex: {
      sensitive: e.s ?? null,
      limits: e.lim ?? [],
      note: e.note ?? null,
      ews: !!e.ews,
      ai: e.by === 'gemini' ? { on: e.on ?? null, sources: e.src ?? (e.from === 'doc-list' ? ['doctorofcredit.com'] : []) } : null,
    },
  };
}

const RECHECK_DAYS = 180;
const AI_MAX = Number(process.env.CHURN_CHEX_MAX) || 30;
const PARALLEL = 5;

const clean = (s) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const goodLimits = (ls) => (ls ?? []).filter((p) => Array.isArray(p) && p.length === 2 && p[0] >= 1 && p[0] <= 60 && p[1] >= 1 && p[1] <= 36);

/** One Gemini call; `search` turns on Google Search. Returns { text, meta }. */
async function gemini(model, prompt, { search = false, schema = null, thinking = null } = {}) {
  if (!aiToken()) throw new Error('no Vertex AI token');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(vertexUrl(model), {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The prompt goes in the user turn: with search on, a system instruction often got an empty answer.
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(search ? { tools: [{ googleSearch: {} }] } : {}),
        generationConfig: {
          temperature: 0,
          ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
          ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
        },
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const c = json.candidates?.[0];
      const text = c?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (text) return { text, meta: c.groundingMetadata ?? null };
      if (attempt >= 3) throw new Error('empty answer');
      continue;
    }
    // Tokens last an hour: on a 401, get a fresh one and try again.
    if (res.status === 401 && attempt < 3 && aiToken(true)) continue;
    if (attempt >= 3 || ![429, 500, 503].includes(res.status)) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

// ---- Step 1: Doctor of Credit's lists, read once ----

const LIST_PROMPT = `Below are two crowdsourced lists from Doctor of Credit: (A) banks and credit unions reported to be sensitive (or not) to ChexSystems inquiries, i.e. people denied a new account for opening too many accounts recently, with data points like "Denied with 5 in the last 6 months" or "Approved with 20 in 12 months"; (B) which institutions do or don't pull Early Warning Services (EWS).
For EACH institution in "Our banks", find it in the lists; bank = our name exactly, listName = the name the list uses. Match the same institution even if the name differs a little (e.g. "Citi" = "Citibank", "Truist" = "BB&T"/"SunTrust"), but never a different institution with a similar name (e.g. "Orion Financial" is not "Orion Bank"; a credit union is not a bank of the same town). Skip banks that aren't in either list.
- sensitive: true if the list reports denials for recent inquiries, false if it's listed as not sensitive or only approvals are reported, null if it's only in list B.
- limits: the denial data points as [accounts, months], smallest first (days: 30 days = 1 month, 90 days = 3; years x 12). One report often lists one person's history over several windows (e.g. "denied with 1/1, 6/3, 10/12" or "2/1 through 41/24"): that's ONE data point, so give only its longest window (here [10, 12] or [41, 24]), not each window. Skip vague ones ("lots", "lol", "numerous"). Empty if none.
- ews: true if list B says it pulls EWS.
- note: one short plain sentence on what's reported (mixed reports, branch vs online...), no em dashes; "" if nothing to add.`;

const LIST_SCHEMA = {
  type: 'OBJECT',
  properties: {
    banks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          bank: { type: 'STRING' },
          listName: { type: 'STRING' },
          sensitive: { type: 'BOOLEAN', nullable: true },
          limits: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'INTEGER' } } },
          ews: { type: 'BOOLEAN' },
          note: { type: 'STRING' },
        },
        required: ['bank', 'listName', 'sensitive', 'limits', 'ews', 'note'],
      },
    },
  },
  required: ['banks'],
};

/** Entries for our banks found in Doctor of Credit's lists. */
export async function readLists(banks, lists) {
  const text = (html) => htmlToLines(html).join('\n');
  const prompt = `${LIST_PROMPT}\n\nOur banks:\n${banks.join('\n')}\n\n(A) Inquiry sensitive list:\n${text(lists.sensitive)}\n\n(B) EWS list:\n${text(lists.ews)}`;
  const { text: out } = await gemini(MODEL, prompt, { schema: LIST_SCHEMA });
  const ours = new Map(banks.map((b) => [bankKey(b), b]));
  const found = new Map();
  for (const a of JSON.parse(out).banks ?? []) {
    if (!ours.has(bankKey(a.bank))) continue; // only names we asked about
    const e = { s: typeof a.sensitive === 'boolean' ? a.sensitive : null };
    const lim = e.s ? goodLimits(a.limits) : [];
    if (lim.length) e.lim = lim;
    // A name that differs gets shown, so a wrong match is easy to spot.
    const listed = clean(a.listName);
    const note = [listed && bankKey(listed) !== bankKey(a.bank) ? `Listed as ${listed}.` : '', clean(a.note)].filter(Boolean).join(' ');
    if (note) e.note = note;
    if (a.ews) e.ews = true;
    found.set(bankKey(a.bank), e);
  }
  return found;
}

// ---- Step 2: the rest, searched by a cheap model and read by a strong one ----

const SEARCH_PROMPT = (bank) => `Search the web for reports about ${bank} turning down people who opened too many bank accounts recently (ChexSystems or Early Warning Services inquiries, "inquiry sensitive"), or approving them anyway. Look at Doctor of Credit, Reddit (r/churning, r/BankBonuses) and myFICO forums. Quote what you find word for word, each quote with its site. If you find nothing about ${bank} specifically, say "nothing found".`;

const READ_PROMPT = (bank, found) => `Here is what a web search found about ${bank} and recently opened accounts (ChexSystems / Early Warning Services inquiries):
---
${found}
---
Based only on that:
- sensitive: true if people report being denied for recent inquiries or new accounts at ${bank}, false if people report being approved despite many recent inquiries, null if nothing is about ${bank} specifically.
- limits: the reported denials as [accounts, months], e.g. "denied with 5 inquiries in 6 months" = [5, 6]; smallest numbers first. One report often lists one person's history over several windows (e.g. "denied with 1/1, 6/3, 10/12" or "2/1 through 41/24"): that's ONE data point, so give only its longest window (here [10, 12] or [41, 24]), not each window. Empty if none.
- ews: true if it's reported to check Early Warning Services.
- note: one short plain sentence on what's reported (no em dashes), or "".`;

const ENTRY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sensitive: { type: 'BOOLEAN', nullable: true },
    limits: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'INTEGER' } } },
    ews: { type: 'BOOLEAN' },
    note: { type: 'STRING' },
  },
  required: ['sensitive', 'limits', 'ews', 'note'],
};

/** One bank looked up on the web: the cheap model searches, MODEL decides. */
export async function lookUpBank(bank, states) {
  const where = states?.length ? ` (${states.join(', ')})` : '';
  const { text: found, meta } = await gemini(SEARCH_MODEL, SEARCH_PROMPT(`${bank}${where}`), { search: true, thinking: 'LOW' });
  const sources = [...new Set((meta?.groundingChunks ?? []).map((g) => g.web?.title).filter(Boolean))];
  const searched = sources.length > 0 || !!meta?.webSearchQueries?.length;
  if (!searched || /^\W*nothing found\W*$/i.test(found.trim())) return { ans: { sensitive: null, limits: [], ews: false, note: '' }, sources, searched };
  const { text } = await gemini(MODEL, READ_PROMPT(bank, found), { schema: ENTRY_SCHEMA });
  return { ans: JSON.parse(text), sources, searched };
}

/** A web lookup's answer as an entry, or throws when it doesn't hold up. No web search = nothing found. */
export function toChexEntry({ ans, sources, searched }, today) {
  if (!searched) return { s: null, by: 'gemini', on: today, from: 'web' };
  if (ans.sensitive != null && typeof ans.sensitive !== 'boolean') throw new Error(`bad sensitive ${ans.sensitive}`);
  const e = { s: ans.sensitive ?? null };
  const lim = e.s ? goodLimits(ans.limits) : [];
  if (lim.length) e.lim = lim;
  if (clean(ans.note)) e.note = clean(ans.note);
  if (ans.ews) e.ews = true;
  return { ...e, by: 'gemini', on: today, from: 'web', ...(sources.length ? { src: sources.slice(0, 5) } : {}) };
}

/** Banks a web lookup should cover: no entry, or an old one of Gemini's own from the web. */
export function banksToCheck(banks, data, today) {
  const old = (on) => !on || (Date.parse(today) - Date.parse(on)) / 864e5 > RECHECK_DAYS;
  return banks.filter((b) => {
    const e = data[bankKey(b)];
    return !e || (e.s == null && !e.by) || (e.by === 'gemini' && e.from === 'web' && old(e.on));
  });
}

/**
 * The monthly check. `lists` is { sensitive, ews } with each Doctor of Credit
 * post ({ modified_gmt, content.rendered }), or null if they couldn't be
 * fetched. Saves what it learns; returns { data, log }.
 */
export async function checkChex(deals, file, today, lists) {
  const data = readChex(file);
  if (process.env.CHURN_AI_TERMS === '0' || !aiToken()) return { data, log: 'ChexSystems not checked (no Gemini access)' };
  const states = new Map();
  for (const d of deals) states.set(d.bank, d.nationwide ? [] : d.states);
  const banks = [...new Set(deals.map((d) => d.bank))];
  const hand = (b) => { const e = data[bankKey(b)]; return e && !e.by && e.s != null; };
  const logs = [];
  let changed = false;

  // Step 1: the lists, when they changed since last read.
  const stamp = lists && `${lists.sensitive.modified_gmt}|${lists.ews.modified_gmt}`;
  if (lists && data._lists?.read !== stamp) {
    try {
      const found = await readLists(banks.filter((b) => !hand(b)), { sensitive: lists.sensitive.content.rendered, ews: lists.ews.content.rendered });
      for (const [k, e] of found) data[k] = { ...(data[k]?.ews && !e.ews ? { ews: true } : {}), ...e, by: 'gemini', on: today, from: 'doc-list' };
      data._lists = { read: stamp, on: today };
      changed = true;
      logs.push(`${found.size} banks matched in Doctor of Credit's lists`);
    } catch (err) {
      console.warn(`::warning::Gemini couldn't read Doctor of Credit's ChexSystems lists: ${err.message}`);
    }
  }

  // Step 2: the rest, from the web.
  const todo = banksToCheck(banks, data, today);
  let ok = 0;
  const batch = todo.slice(0, AI_MAX);
  for (let i = 0; i < batch.length; i += PARALLEL) {
    await Promise.all(batch.slice(i, i + PARALLEL).map(async (bank) => {
      try {
        data[bankKey(bank)] = { ...data[bankKey(bank)], ...toChexEntry(await lookUpBank(bank, states.get(bank)), today) };
        ok++;
      } catch (err) {
        console.warn(`::warning::Gemini couldn't look up ${bank}'s ChexSystems sensitivity: ${err.message}`);
      }
    }));
  }
  if (todo.length) logs.push(`${ok} of ${todo.length} banks looked up on the web by ${MODEL}`);
  if (ok || changed) writeChex(file, data);
  return { data, log: logs.join('; ') || 'ChexSystems: nothing new to check' };
}
