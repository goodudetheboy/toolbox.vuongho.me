// Deterministic parsing of Doctor of Credit's "Best Bank Account Bonuses" page
// and the bonus post each entry links to. No LLM, no guessing beyond the regexes
// below: a field we can't read stays null and the UI says "see post" instead.
// See docs/adr/0001-deal-data-from-doc-rest-api.md.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', reg: '®', trade: '™',
  copy: '©', bull: '•', middot: '·', frac12: '½', times: '×', dollar: '$', eacute: 'é',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Post HTML → trimmed text lines. Struck-through text (<del>/<s>/<strike>) is dropped:
 * DoC strikes out superseded dates and amounts ("Extended to ~~9/30~~ 11/30"), and
 * keeping them would make every expiration ambiguous. Headings come out as "## Title".
 */
export function htmlToLines(html) {
  let s = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(del|strike)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<s(?:\s[^>]*)?>[\s\S]*?<\/s>/gi, '')
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div|\/ul|\/ol|\/table|\/blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/[ \t ]+/g, ' ');
  return s.split('\n').map((l) => l.trim()).filter((l) => l && l !== '##');
}

// ---------- small helpers ----------

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90,
};
const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|sixty|ninety)';

export function toNumber(word) {
  if (word == null) return null;
  const w = String(word).toLowerCase();
  if (w in WORD_NUMBERS) return WORD_NUMBERS[w];
  const n = parseInt(w.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Every dollar amount in a string ("$1,000", "$1.5k", "$25k" → 25000). */
export function dollars(s) {
  const out = [];
  for (const m of s.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|K|million)?\b/g)) {
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (m[2] === 'k' || m[2] === 'K') n *= 1000;
    if (m[2] === 'million') n *= 1e6;
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** "90 days", "six months", "one year", "2 statement cycles" → days. */
export function durationDays(s) {
  const m = s.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:full\\s+|consecutive\\s+|calendar\\s+|business\\s+)*(days?|months?|years?|weeks?|statement cycles?|cycles?)`, 'i'));
  if (!m) return null;
  const n = toNumber(m[1]);
  if (n == null) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith('day')) return n;
  if (unit.startsWith('week')) return n * 7;
  if (unit.startsWith('year')) return n * 365;
  return n * 30; // months, statement cycles
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATE_RE = new RegExp(
  `${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?|\\b(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?\\b`,
  'gi',
);

function iso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Every date in `s`, as ISO strings. Dates without a year get the first year that
 * puts them on or after `ref` (an ISO date — usually the update note's own date),
 * since a year-less "extended to 9/30" always points forward.
 */
export function findDates(s, ref) {
  const out = [];
  const refYear = ref ? Number(ref.slice(0, 4)) : new Date().getUTCFullYear();
  for (const m of s.matchAll(DATE_RE)) {
    let y, mo, d;
    if (m[1]) {
      mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
      d = Number(m[2]);
      y = m[3] ? Number(m[3]) : null;
    } else {
      mo = Number(m[4]);
      d = Number(m[5]);
      y = m[6] ? Number(m[6]) : null;
      if (y != null && y < 100) y += 2000;
    }
    if (y == null) {
      y = refYear;
      const candidate = iso(y, mo, d);
      if (candidate && ref && candidate < ref) y += 1;
    }
    const v = iso(y, mo, d);
    if (v && y >= 2015 && y <= 2100) out.push({ date: v, index: m.index, end: m.index + m[0].length });
  }
  return out;
}

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
export const STATE_CODES = Object.keys(STATES);

/** State codes named in a title/availability string (codes in caps, or full names). */
export function findStates(s) {
  const found = new Set();
  const text = s.replace(/D\.C\./g, 'DC').replace(/\bNYC\b/g, 'NY');
  for (const m of text.matchAll(/\b([A-Z]{2})\b/g)) if (STATES[m[1]]) found.add(m[1]);
  for (const [code, name] of Object.entries(STATES)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text) && !(code === 'WA' && /Washington,? D\.?C/i.test(s))) {
      found.add(code);
    }
  }
  return [...found].sort();
}

// ---------- index page ----------

const CATEGORY_KEYS = [
  [/checking/i, 'checking'],
  [/sav/i, 'savings'],
  [/business/i, 'business'],
  [/state/i, 'state'],
  [/region|branch/i, 'regional'],
];

function slugOf(url) {
  const m = url.match(/^https?:\/\/(?:www\.)?doctorofcredit\.com\/([a-z0-9-]+)\/?(?:[#?].*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

const NOT_DEALS = /^(best-bank-account-bonuses|go|tag|category|bank-accounts|knowledge-base)$/;

/**
 * The index post → one entry per <h3> deal: its category (from the <h2> above it),
 * title, the short blurb under it and the DoC posts it links to ("Read our full post"
 * links first — those are the deal's own write-ups).
 */
export function parseIndex(html) {
  const parts = html.split(/(<h[23][^>]*>[\s\S]*?<\/h[23]>)/i);
  const entries = [];
  let category = null;
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i];
    const body = parts[i + 1] ?? '';
    const title = decodeEntities(heading.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (/^<h2/i.test(heading)) {
      category = CATEGORY_KEYS.find(([re]) => re.test(title))?.[1] ?? 'other';
      continue;
    }
    if (!category) continue;
    const links = [];
    for (const m of body.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim();
      links.push({ url: decodeEntities(m[1]), text });
    }
    const postLinks = links
      .map((l) => ({ ...l, slug: slugOf(l.url) }))
      .filter((l) => l.slug && !NOT_DEALS.test(l.slug));
    // "Read our full post", "our full post on …" — those come first.
    postLinks.sort((a, b) => Number(/full post|read/i.test(b.text)) - Number(/full post|read/i.test(a.text)));
    const slugs = [...new Set(postLinks.map((l) => l.slug))];
    const offerLink = links.find((l) => /direct link|offer/i.test(l.text) && !slugOf(l.url))?.url ?? null;
    entries.push({ category, title, blurb: htmlToLines(body), slugs, offerLink });
  }
  return entries;
}

// ---------- a single bonus post ----------

const GLANCE_KEYS = [
  ['bonusText', /^maximum bonus/i],
  ['availability', /^availability/i],
  ['ddText', /^direct deposit/i],
  ['extraReqText', /^additional requirements?/i],
  ['pullText', /^hard\s*\/\s*soft/i],
  ['chexText', /^chex/i],
  ['ccText', /^credit card funding/i],
  ['monthlyFeeText', /^monthly fees?/i],
  ['eatfText', /^early account termination/i],
  ['householdText', /^household/i],
  ['expirationText', /^expiration/i],
];

function section(lines, name) {
  const start = lines.findIndex((l) => new RegExp(`^## (the )?${name}`, 'i').test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## ') && !/^## (monthly fees|early account)/i.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

function updateDateOf(line) {
  const m = line.match(/^(?:update|updated)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return m ? findDates(m[1])[0]?.date ?? null : null;
}

const EXTENSION_CUE = /(through|thru|until|till|til|to|ends?|ending|expires?|expiring|valid|available|back|good|by)\s*:?\s*$/i;

/**
 * Expiration candidates from the update notes at the top of a post (newest first).
 * Only a date right after a cue word counts ("extended to 11/30", "back until 9/30",
 * "valid through Dec 31"), so "Update 9/6/26:" itself and "available from 9/16"
 * don't. Year-less dates resolve relative to the note's own update date.
 */
export function extensionDates(preLines, modified) {
  const out = [];
  let lastRef = modified;
  for (const line of preLines) {
    const ref = updateDateOf(line) ?? lastRef;
    const body = line.replace(/^(?:update|updated)\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*[:;]?/i, '');
    for (const d of findDates(body, ref)) {
      const before = body.slice(Math.max(0, d.index - 30), d.index);
      if (EXTENSION_CUE.test(before) || /^\s*extended/i.test(body.slice(0, d.index))) out.push(d.date);
    }
    if (out.length) break; // the newest note that names an end date wins
  }
  return out;
}

function classifyPull(t) {
  if (!t) return 'unknown';
  const soft = /soft/i.test(t);
  const hard = /hard/i.test(t);
  if (/mixed/i.test(t)) return 'mixed';
  if (soft && hard) return /^\s*soft/i.test(t) && !/looks to be a hard|is a hard/i.test(t) ? 'mixed' : /^\s*hard pull/i.test(t) ? 'hard' : 'mixed';
  if (soft) return 'soft';
  if (hard) return 'hard';
  return 'unknown';
}

function classifyChex(t) {
  if (!t) return { pulls: 'unknown', sensitive: false };
  // "Yes, not sensitive" isn't; "Unknown, sensitive (not sensitive in branch)" is.
  const sensitive = /sensitive/i.test(t) && !/^\s*(yes|unknown|no)?[,.]?\s*not sensitive\.?\s*$/i.test(t);
  let pulls = 'unknown';
  if (/^(no|doesn’t|doesn't|does not)/i.test(t.trim()) || /likely doesn|most say they don/i.test(t)) pulls = 'no';
  else if (/^yes/i.test(t.trim()) || /most likely does/i.test(t)) pulls = 'yes';
  else if (/mixed/i.test(t)) pulls = 'mixed';
  return { pulls, sensitive };
}

// "Direct deposit OR 12 transactions", "one of the following", "$100 without the
// direct deposit": DD is an option, not a requirement.
const DD_ALTERNATIVE = /\bone of the following|\bOR\b|\beither\b|without|optional|not required|no direct deposit/;

function parseDdRequired(ddText, blurb, offer) {
  if (ddText) {
    if (/^\s*(no\b|none)/i.test(ddText)) {
      // The glance line is occasionally wrong; trust the offer only when it flatly
      // requires an amount of DD with no alternative path.
      const flat = offer.some((l) => /direct deposits?\b/i.test(l) && requirementAmounts(l).some((n) => n >= 100));
      return flat && !offer.some((l) => DD_ALTERNATIVE.test(l)) ? true : false;
    }
    if (/^\s*(not required|optional)/i.test(ddText)) return false;
    if (/^\s*(yes|\$)/i.test(ddText) || /direct deposit|electronic deposit/i.test(ddText)) return true;
  }
  const b = blurb.join(' ');
  if (/direct deposit (is )?not required|no direct deposit|no requirements/i.test(b)) return false;
  if (/direct deposit (of .* )?required/i.test(b)) return true;
  if (offer.some((l) => /direct deposit/i.test(l))) return true;
  return null;
}

const DD_LINE = /direct deposit|payroll|electronic deposit|ACH deposit|qualifying deposit/i;
const MONTHLY = /(per|each|every|a)\s+(calendar\s+)?(month|statement cycle|statement period)|monthly|per cycle|each cycle/i;

/**
 * Dollar amounts in `line` that read as a requirement, not as the bonus itself:
 * "receive a bonus of $300", "$200 cash bonus" and "for the $325 bonus" are skipped.
 */
export function requirementAmounts(line) {
  const out = [];
  for (const m of line.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|K)?\b/g)) {
    const before = line.slice(Math.max(0, m.index - 28), m.index);
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (/(bonus|reward|incentive|earn|get|receive|offering|extra|additional)(\s+(a|an|of|up to|the|another|your))*\s*$/i.test(before)) continue;
    if (/^\s*(cash\s+|checking\s+|savings\s+|account\s+)?(bonus|reward|incentive)/i.test(after)) continue;
    if (/\bfor\s+(the\s+|a\s+)?$/i.test(before)) continue;
    const n = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Direct deposit requirement read from the glance line and the offer text, always
 * expressed as the *total* that must land within `windowDays` (top tier when the
 * offer is tiered). Per-month amounts are multiplied out ("$500 per month for three
 * months" → 1500) and "two deposits each of $500" → 1000. `amount: 0` with
 * `required: true` means "any amount".
 */
export function parseDirectDeposit(ddText, offerLines, blurb) {
  const required = parseDdRequired(ddText, blurb, offerLines);
  if (required === false) return { required: false, amount: 0, windowDays: null, monthly: false, months: null, minDeposits: null };
  const lines = [ddText ?? '', ...offerLines.filter((l) => DD_LINE.test(l))].filter(Boolean);
  const text = lines.join(' ');

  let months = null;
  const mm = text.match(new RegExp(`(?:for|in)\\s+(?:at least\\s+)?${NUM}\\s+(?:consecutive\\s+|full\\s+|separate\\s+)*(?:calendar\\s+)?(?:months|statement cycles|cycles|statement periods)`, 'i'))
    ?? text.match(new RegExp(`${NUM}\\s+(?:consecutive\\s+)?(?:months|statement cycles|cycles)\\s+out of`, 'i'))
    ?? text.match(new RegExp(`${NUM}\\s+consecutive\\s+(?:months|statement cycles|cycles)`, 'i'));
  if (mm) months = toNumber(mm[1]);
  const monthly = MONTHLY.test(text) || months != null;

  let minDeposits = null;
  const dm = text.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?\\+?\\s*(?:or more\\s+)?(?:separate\\s+|qualifying\\s+|payroll\\s+|ACH\\s+|enhanced\\s+|recurring\\s+|electronic\\s+)*(?:direct\\s+)?deposits`, 'i'));
  if (dm) minDeposits = toNumber(dm[1]);

  let total = 0;
  for (const l of lines) {
    const amts = requirementAmounts(l).filter((n) => n >= 25 && n <= 100000);
    if (!amts.length) continue;
    let a = Math.max(...amts);
    if (minDeposits && /\beach (of|at least|for)|\$[\d,]+\s*(or more\s+)?each\b/i.test(l)) a *= minDeposits;
    else if ((MONTHLY.test(l) || /\bmonths?\b/i.test(l)) && !/total|cumulative|combined/i.test(l)) a *= months ?? 1;
    total = Math.max(total, a);
  }

  let windowDays = null;
  for (const l of lines) {
    const m = l.match(new RegExp(`(?:within|in|during|of)\\s+(?:the\\s+|your\\s+)?(?:first\\s+)?${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:full\\s+|calendar\\s+|business\\s+)*(days?|months?|statement cycles?)`, 'i'));
    if (m) {
      windowDays = durationDays(`${m[1]} ${m[2]}`);
      break;
    }
  }
  if (monthly && months && !windowDays) windowDays = months * 30 + 30;
  return {
    required: required ?? null,
    amount: required ? total : total || null,
    windowDays,
    monthly,
    months: monthly ? months : null,
    minDeposits,
  };
}

const BAL_LINE = /\b(deposit|fund|maintain|balance|new money|keep)\w*/i;

/** A deposit/balance requirement that isn't direct deposit: amount + how long it must stay. */
export function parseBalance(offerLines) {
  let amount = null;
  let holdDays = null;
  for (const l of offerLines) {
    if (!BAL_LINE.test(l) || /direct deposit/i.test(l) && !/maintain|balance/i.test(l)) continue;
    if (/opening deposit|minimum (opening )?deposit (of|is)|open (the account )?with/i.test(l) && !/maintain|balance of/i.test(l)) continue;
    const cleaned = l.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:cash\s+)?(?:bonus|reward)/gi, '');
    const amts = dollars(cleaned).filter((n) => n >= 1000);
    if (!amts.length) continue;
    const a = Math.max(...amts);
    if (amount == null || a > amount) amount = a;
    const h = l.match(new RegExp(`(?:for|of|at least|minimum of|through)\\s+(?:at least\\s+)?(?:the\\s+)?(?:first\\s+)?${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:consecutive\\s+|full\\s+|calendar\\s+)*(days?|months?)`, 'i'));
    if (h && /maintain|keep|hold|balance|remain|leave/i.test(l)) holdDays = Math.max(holdDays ?? 0, durationDays(`${h[1]} ${h[2]}`));
  }
  if (amount != null && holdDays == null) {
    const all = offerLines.join(' ');
    const h = all.match(new RegExp(`(?:maintain|keep|hold)[^.]{0,80}?${NUM}\\s*(?:consecutive\\s+|calendar\\s+)*(days|months)`, 'i'));
    if (h) holdDays = durationDays(`${h[1]} ${h[2]}`);
  }
  return amount == null ? null : { amount, holdDays };
}

/**
 * Tier lists like "$1,000 bonus: $50,000+" under an "average collected balance" or
 * "new money" intro → [{ bonus, amount }].
 */
export function parseBalanceTiers(offerLines) {
  if (!offerLines.some((l) => /balance|new money|deposit/i.test(l))) return [];
  const tiers = [];
  for (const l of offerLines) {
    const m = l.match(/^\$\s?(\d[\d,]*)\s*(?:cash\s+)?bonus\s*[:–-]\s*\$\s?(\d[\d,]*)/i);
    if (m && !/direct deposit/i.test(l)) tiers.push({ bonus: toNumber(m[1]), amount: toNumber(m[2]) });
  }
  return tiers.filter((t) => t.bonus && t.amount && t.amount > t.bonus);
}

/** "Complete 15 debit card purchases" → 15 (the largest such count in the offer). */
export function parseTransactions(lines) {
  let n = null;
  const re = new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:or more\\s+)?((?:[a-z-]+\\d?\\s+){0,6}?)(?:purchases?|transactions?|payments?|swipes?)\\b`, 'gi');
  for (const l of lines) {
    for (const m of l.matchAll(re)) {
      // "90 days of transactions", "$5 or more transactions" aren't counts.
      if (/day|month|cycle|statement|year|week/i.test(m[2]) || /\$\s*$/.test(l.slice(0, m.index))) continue;
      const v = toNumber(m[1]);
      if (v != null && v >= 1 && v <= 100) n = Math.max(n ?? 0, v);
    }
  }
  return n;
}

export function parsePromoCode(lines) {
  for (const l of lines) {
    const m = l.match(/(?:promo(?:tion(?:al)?)?|offer|bonus)\s+code\s*:?\s*[“"']?([A-Za-z0-9]{3,20})/i) ?? l.match(/\bcode\s*:?\s*[“"']?([A-Z0-9]*\d[A-Z0-9]*|[A-Z]{4,})\b/);
    if (m && !/^(is|the|when|and|for|must|required)$/i.test(m[1])) return m[1];
  }
  return null;
}

export function parsePayoutDays(lines) {
  const re = new RegExp(`(?:bonus|credited|deposited|paid|posted|receive)[^.]{0,120}?within\\s+(?:approximately\\s+)?${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:calendar\\s+|business\\s+)?(days|weeks|months|statement cycles?)`, 'i');
  for (const l of lines) {
    const m = l.match(re);
    // "deduct the bonus if the account is closed within 12 months" is a clawback,
    // not a payout time; real payout windows are a few weeks to a few months.
    if (!m || /clos|terminat|deduct|forfeit|reverse|open(ed|ing)?\b/i.test(m[0])) continue;
    const days = durationDays(`${m[1]} ${m[2]}`);
    if (days != null && days <= 120) return days;
  }
  return null;
}

export function parseEatf(t) {
  if (!t || /^\s*(none|no\b|n\/a)/i.test(t)) return { fee: 0, days: null, forfeit: false };
  if (/^\s*unknown/i.test(t)) return { fee: null, days: null, forfeit: false };
  const fee = dollars(t)[0] ?? 0;
  let days = durationDays(t);
  if (days == null && /one year/i.test(t)) days = 365;
  return { fee, days, forfeit: /forfeit|claw|bonus (will be )?(deducted|reversed)|full bonus/i.test(t) };
}

export function parseMonthlyFee(t) {
  if (!t || /^\s*(none|no\b|\$0\b)/i.test(t)) return { amount: 0, avoidable: true };
  if (/^\s*unknown/i.test(t)) return { amount: null, avoidable: null };
  const amts = dollars(t);
  return { amount: amts.length ? Math.max(...amts) : null, avoidable: !/not (avoidable|waivable)/i.test(t) && /avoid|waiv|with e-?statements|paperless|none with/i.test(t) };
}

export function parseCcFunding(t) {
  if (!t || /^\s*(none|no\b|cannot|n\/a|unknown)/i.test(t)) return /^\s*unknown/i.test(t ?? '') ? null : 0;
  if (/cash advance/i.test(t) && !/up to/i.test(t)) return 0;
  const a = dollars(t);
  return a.length ? Math.max(...a) : null;
}

function cleanNote(line) {
  return line.replace(/\s*hat tip.*$/i, '').trim();
}

/** "Chase $900 Checking/Savings" → "Chase". Best-effort bank name for display/search. */
export function bankName(title) {
  const t = title.replace(/^\(?[A-Z]{2}\b(?:[,/ &]+[A-Z]{2}\b)*\)?\s*[-–:]\s*/, '');
  const m = t.match(/^(.*?)(?:\s*[-–(]\s*)?(?:\$|up to\b|\d{1,3}(?:,\d{3})+\s*(?:points|miles))/i);
  return ((m && m[1]) || t.split(/\s[-–]\s/)[0])
    .replace(/[\s:–-]+$/, '')
    // "Visions Federal Credit Union – NY, PA, NJ" → drop the trailing state list.
    .replace(/\s+[-–]\s+(?:[A-Z]{2,3}\b[\s,&/]*(?:and\s+|or\s+)?)+(?:only)?$/, '')
    .trim();
}

/** Bonus amounts in the index title: "$400-$2,500" → [400, 2500]; "35,000 Points" → points. */
export function titleBonus(title) {
  const amts = dollars(title.replace(/\+\s*\$\d[\d,]*\s*streaming credit/i, ''));
  const pts = title.match(/(\d{1,3}(?:,\d{3})+)\s*(points|miles)/i);
  return { amounts: amts, points: pts ? toNumber(pts[1]) : null, pointsUnit: pts ? pts[2].toLowerCase() : null };
}

/**
 * One index entry + its primary post → the deal record the app renders.
 * `post` is the REST API object ({ slug, link, modified_gmt, content.rendered }).
 */
export function parseDeal(entry, post) {
  const lines = post ? htmlToLines(post.content.rendered) : [];
  const modified = post?.modified_gmt?.slice(0, 10) ?? null;
  const glanceAt = lines.findIndex((l) => /offer at a glance/i.test(l));
  const preLines = glanceAt > 0 ? lines.slice(0, glanceAt).filter((l) => !l.startsWith('## ')) : [];
  const glance = {};
  if (glanceAt >= 0) {
    for (const l of lines.slice(glanceAt + 1, glanceAt + 25)) {
      if (l.startsWith('## ') || /^contents$/i.test(l)) break;
      const m = l.match(/^([^:]{3,40}):\s*(.*)$/);
      if (!m) continue;
      const key = GLANCE_KEYS.find(([, re]) => re.test(m[1].trim()))?.[0];
      if (key && !(key in glance)) glance[key] = m[2].trim();
    }
  }
  const offer = section(lines, 'offer').filter((l) => !/^direct link/i.test(l));
  const finePrint = section(lines, 'fine print');
  const verdict = section(lines, '(our )?verdict');
  const requirementLines = offer.slice(0, 14);
  const blurb = entry.blurb.filter((l) => !/^(read our|direct link|see the links|soft pull$|hard pull$)/i.test(l));

  // Bonus: the index title is re-curated monthly, so it wins over a stale glance line.
  const tb = titleBonus(entry.title);
  const glanceBonus = glance.bonusText ? dollars(glance.bonusText) : [];
  const amounts = tb.amounts.length ? tb.amounts : glanceBonus;
  let bonusMax = amounts.length ? Math.max(...amounts) : null;
  let bonusMin = amounts.length ? Math.min(...amounts) : null;
  let bonusNote = null;
  if (!bonusMax && tb.points) {
    // Points/miles valued at a conservative 1¢ each.
    bonusMax = bonusMin = Math.round(tb.points * 0.01);
    bonusNote = `${tb.points.toLocaleString('en-US')} ${tb.pointsUnit} (≈1¢ each)`;
  }

  // When the index headline names an amount the post never mentions (a newer portal
  // offer, or a tier whose terms live elsewhere), the requirements we read are for
  // the post's own bonus; value math uses that, conservatively.
  let bonusPostMax = null;
  if (post && bonusMax && glanceBonus.length && !dollars(lines.join(' ')).includes(bonusMax)) {
    bonusPostMax = Math.max(...glanceBonus);
  }

  // Expiration: the newest update note's "extended to …", the glance field, and
  // "(valid through …)" in the index blurb; dates only ever move later, so take the max.
  const candidates = [];
  const ext = extensionDates(preLines, modified);
  candidates.push(...ext);
  const glanceExp = glance.expirationText ? findDates(glance.expirationText, null).map((d) => d.date) : [];
  candidates.push(...glanceExp);
  for (const l of blurb) {
    for (const d of findDates(l, modified)) {
      const before = l.slice(Math.max(0, d.index - 25), d.index);
      if (/(through|until|thru|till|expires?|ends?|by)\s*:?\s*$/i.test(before)) candidates.push(d.date);
    }
  }
  let expires = candidates.length ? candidates.sort().at(-1) : null;
  let noEndDate = !expires && (/none|no end|no expiration/i.test(glance.expirationText ?? '') || preLines.some((l) => /no (end|expiration) date/i.test(l)));
  // "Update 7/17/26: Deal is back" after a 2022 end date means that date is stale.
  const newestNoteDate = preLines.map(updateDateOf).find(Boolean) ?? null;
  const newestNote = preLines.find((l) => updateDateOf(l)) ?? '';
  if (expires && newestNoteDate && expires < newestNoteDate && !ext.length &&
      /\b(back|no (end|expiration) date|available again|still (live|available|working|valid)|new (link|round|bonus)|reposting|now)\b/i.test(newestNote)) {
    expires = null;
    noEndDate = true;
  }

  const allReqLines = [...offer, ...blurb];
  const dd = parseDirectDeposit(glance.ddText ?? null, offer, blurb);
  let balance = parseBalance(offer);
  // A DD deal's offer text often lists an unrelated premium tier ("$200,000 minimum
  // balance for $1,500"); a balance that dwarfs the listed bonus isn't this deal's.
  if (balance && dd.required && bonusMax && balance.amount > bonusMax * 50) balance = null;
  if (!balance) {
    const tiers = parseBalanceTiers(offer);
    const tier = tiers.find((t) => t.bonus === bonusMax) ?? tiers.filter((t) => t.bonus <= (bonusMax ?? Infinity)).sort((a, b) => b.bonus - a.bonus)[0];
    if (tier) balance = { amount: tier.amount, holdDays: null };
  }
  const eatf = parseEatf(glance.eatfText ?? null);
  const states = findStates(`${entry.title} | ${glance.availability ?? ''}`);
  const availability = glance.availability ?? null;
  const nationwide = /nationwide|all (50 )?states|anywhere in the u/i.test(availability ?? '') ||
    (states.length === 0 && ['checking', 'savings', 'business'].includes(entry.category));
  const inBranch = /in[- ]branch/i.test(`${entry.title} ${availability ?? ''}`) && !/online or in[- ]branch|in[- ]branch or online/i.test(availability ?? '');
  const ended = preLines.length > 0 && /deal (has |is )?(ended|expired|dead)|no longer available|this (deal|offer) (has )?ended/i.test(preLines[0]);
  const chex = classifyChex(glance.chexText ?? null);

  return {
    id: post?.slug ?? entry.slugs[0] ?? entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: entry.title,
    bank: bankName(entry.title),
    category: entry.category,
    url: post?.link ?? (entry.slugs[0] ? `https://www.doctorofcredit.com/${entry.slugs[0]}/` : null),
    otherPosts: entry.slugs.slice(1).map((s) => `https://www.doctorofcredit.com/${s}/`),
    offerLink: entry.offerLink,
    postUpdated: modified,
    blurb: blurb.slice(0, 6),
    latestNote: preLines.length ? cleanNote(preLines[ended ? 1 : 0] ?? '') || null : null,
    bonusMax,
    bonusMin,
    bonusNote,
    bonusPostMax,
    bonusText: glance.bonusText ?? null,
    availability,
    states,
    nationwide,
    inBranch,
    expires,
    noEndDate,
    expirationText: glance.expirationText ?? null,
    ended,
    dd,
    ddText: glance.ddText ?? null,
    balance,
    transactions: parseTransactions(allReqLines),
    promoCode: parsePromoCode(offer),
    payoutDays: parsePayoutDays([...finePrint, ...offer]),
    extraReqText: glance.extraReqText ?? null,
    pull: classifyPull(glance.pullText ?? blurb.find((l) => /pull/i.test(l)) ?? null),
    pullText: glance.pullText ?? null,
    chexPulls: chex.pulls,
    chexSensitive: chex.sensitive,
    chexText: glance.chexText ?? null,
    ccFunding: parseCcFunding(glance.ccText ?? null),
    ccText: glance.ccText ?? null,
    monthlyFee: parseMonthlyFee(glance.monthlyFeeText ?? null),
    monthlyFeeText: glance.monthlyFeeText ?? null,
    eatf,
    eatfText: glance.eatfText ?? null,
    householdText: glance.householdText ?? null,
    requirements: requirementLines,
    verdict: verdict.filter((l) => !/^(hat tip|useful posts)/i.test(l)).slice(0, 4).map(cleanNote).filter(Boolean),
    hasGlance: glanceAt >= 0,
  };
}
