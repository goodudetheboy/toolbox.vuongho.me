// How sensitive each bank is to recently opened accounts (ChexSystems / Early
// Warning Services inquiries), by bank: data/chex.json. Hand entries come from
// Doctor of Credit's crowdsourced list (2026-10-17); banks with no entry are
// looked up by Gemini with Google Search once a month, and re-checked after
// RECHECK_DAYS. See docs/adr/0016-chexsystems-in-plans.md.
//
// Entry: { s: true | false | null (sensitive / not / unknown), lim: [[accounts,
// months], ...] (reported denials: that many new accounts within that many
// months), note, ews (checks Early Warning Services), by: "gemini", on, src }.

import { readFileSync, writeFileSync } from 'node:fs';
import { aiToken, MODEL, vertexUrl } from './ai-terms.mjs';

export const bankKey = (b) => b.toLowerCase().replace(/[^a-z0-9]/g, '');

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
      ai: e.by === 'gemini' ? { on: e.on ?? null, sources: e.src ?? [] } : null,
    },
  };
}

const RECHECK_DAYS = 180;
const AI_MAX = Number(process.env.CHURN_CHEX_MAX) || 30;
const PARALLEL = 5;

/** Banks Gemini should look up: no entry, or its own entry is old. Hand entries are never re-checked. */
export function banksToCheck(banks, data, today) {
  const old = (on) => !on || (Date.parse(today) - Date.parse(on)) / 864e5 > RECHECK_DAYS;
  return banks.filter((b) => {
    const e = data[bankKey(b)];
    return !e || (e.s == null && !e.by) || (e.by === 'gemini' && old(e.on));
  });
}

const PROMPT = `You research US banks and credit unions for people opening checking or savings accounts for sign-up bonuses.
Question: does this institution deny new accounts to people who opened too many bank accounts recently (too many ChexSystems or Early Warning Services inquiries)?
Search the web, mainly Doctor of Credit (doctorofcredit.com, including its list of banks and credit unions that are ChexSystems inquiry sensitive), Reddit r/churning and r/BankBonuses, and myFICO forums.
- sensitive: true if people report being denied for recent inquiries or new accounts, false if people report being approved despite many recent inquiries (or a list says it isn't sensitive), null if you find nothing about this institution specifically.
- limits: the reported denials as [accounts, months] pairs, e.g. "denied with 5 inquiries in 6 months" = [5, 6]. Use the smallest numbers reported. Empty if none are given.
- ews: true if it's reported to check Early Warning Services.
- note: one short plain sentence on what's reported (no em dashes), or "" if nothing.
Don't guess: only report what you found about this exact institution.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    sensitive: { type: 'BOOLEAN', nullable: true },
    limits: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'INTEGER' } } },
    ews: { type: 'BOOLEAN' },
    note: { type: 'STRING' },
  },
  required: ['sensitive', 'limits', 'ews', 'note'],
};

/** Asks Gemini, with Google Search, about one bank. Returns the answer and the sites it used. */
export async function askChex(bank, states) {
  const t = aiToken();
  if (!t) throw new Error('no Vertex AI token');
  const where = states?.length ? ` (${states.join(', ')})` : '';
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(vertexUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // In the user turn: with Google Search on, a system instruction often got an empty answer.
        contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nInstitution: ${bank}${where}` }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const c = json.candidates?.[0];
      const out = c?.content?.parts?.map((p) => p.text ?? '').join('');
      if (!out) {
        if (attempt < 3) continue;
        throw new Error('empty answer');
      }
      const sources = [...new Set((c.groundingMetadata?.groundingChunks ?? []).map((g) => g.web?.title).filter(Boolean))];
      // Sites aren't always listed; the search queries show it did search.
      return { ans: JSON.parse(out), sources, searched: sources.length > 0 || !!c.groundingMetadata?.webSearchQueries?.length };
    }
    if (attempt >= 3 || ![429, 500, 503].includes(res.status)) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

/** Gemini's answer as an entry, or throws when it doesn't hold up. No web search = nothing found. */
export function toChexEntry({ ans, sources, searched }, today) {
  const clean = (s) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
  if (!searched) return { s: null, by: 'gemini', on: today };
  if (ans.sensitive != null && typeof ans.sensitive !== 'boolean') throw new Error(`bad sensitive ${ans.sensitive}`);
  const lim = ans.sensitive
    ? (ans.limits ?? []).filter((p) => Array.isArray(p) && p.length === 2 && p[0] >= 1 && p[0] <= 60 && p[1] >= 1 && p[1] <= 36)
    : [];
  const e = { s: ans.sensitive ?? null };
  if (lim.length) e.lim = lim;
  if (clean(ans.note)) e.note = clean(ans.note);
  if (ans.ews) e.ews = true;
  return { ...e, by: 'gemini', on: today, ...(sources.length ? { src: sources.slice(0, 5) } : {}) };
}

/** Has Gemini look up banks with no entry (or an old one of its own); saves them. Returns a log line. */
export async function checkChex(deals, file, today) {
  const data = readChex(file);
  const states = new Map();
  for (const d of deals) states.set(d.bank, d.nationwide ? [] : d.states);
  const todo = banksToCheck([...new Set(deals.map((d) => d.bank))], data, today);
  if (!todo.length) return { data, log: 'no banks to look up' };
  if (process.env.CHURN_AI_TERMS === '0' || !aiToken()) return { data, log: `${todo.length} banks not looked up (no Gemini access)` };
  let ok = 0;
  const batch = todo.slice(0, AI_MAX);
  // A web search takes 30-60 seconds, so a few at a time.
  for (let i = 0; i < batch.length; i += PARALLEL) {
    await Promise.all(batch.slice(i, i + PARALLEL).map(async (bank) => {
      try {
        // Keep what a hand entry already knew (e.g. ews).
        data[bankKey(bank)] = { ...data[bankKey(bank)], ...toChexEntry(await askChex(bank, states.get(bank)), today) };
        ok++;
      } catch (err) {
        console.warn(`::warning::Gemini couldn't look up ${bank}'s ChexSystems sensitivity: ${err.message}`);
      }
    }));
  }
  if (ok) writeChex(file, data);
  return { data, log: `${ok} of ${todo.length} banks' ChexSystems sensitivity looked up by ${MODEL}` };
}
