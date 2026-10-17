// Shape of public/deals.json, produced by scripts/refresh-deals.mjs. A null field
// means the parser couldn't read it from the post; the UI says "see post".

export type Category = 'checking' | 'savings' | 'business' | 'state' | 'regional' | 'other';
export type Pull = 'soft' | 'hard' | 'mixed' | 'unknown';

export interface DirectDeposit {
  required: boolean | null;
  /** Total that must land within `windowDays` (top tier). 0 with required = any amount. */
  amount: number | null;
  windowDays: number | null;
  monthly: boolean;
  months: number | null;
  minDeposits: number | null;
}

export interface Deal {
  id: string;
  rank: number;
  title: string;
  bank: string;
  category: Category;
  url: string | null;
  otherPosts: string[];
  offerLink: string | null;
  postUpdated: string | null;
  blurb: string[];
  latestNote: string | null;
  bonusMax: number | null;
  bonusMin: number | null;
  bonusNote: string | null;
  /** Set when the headline amount isn't in the post: the post's own top bonus. */
  bonusPostMax: number | null;
  bonusText: string | null;
  /** True when the terms below were checked by hand (data/deal-terms.json); false for new or rewritten deals. */
  termsChecked?: boolean;
  /** Set when the checked terms were read by Gemini (new or changed deals), not by hand. */
  termsBy?: { ai: true; on: string | null } | null;
  /** Checked deals: the post's headline amount (bonusMax is then the upfront part only). */
  bonusListed?: number | null;
  /** Checked deals: what earns the upfront bonus, in a sentence. */
  bonusHow?: string | null;
  /** Money that needs a year or more of keeping deposits or balances going. Never counted. */
  later?: { amount: number; how: string }[];
  /** Checked deals: requirements besides direct deposit and parked cash, e.g. "10 debit card purchases within 90 days". */
  extras?: string[];
  /** Checked deals: the monthly fee and the ways to waive it (null when unchecked: see monthlyFee). */
  fee?: Fee | null;
  /** Checked deals with more than one bonus level: every level, top first (see levelsOf). */
  tiers?: Level[];
  /** Set on one level of such a deal (levelsOf): which of `tiers` this is. */
  tier?: number;
  availability: string | null;
  states: string[];
  nationwide: boolean;
  inBranch: boolean;
  expires: string | null;
  noEndDate: boolean;
  expirationText: string | null;
  ended: boolean;
  dd: DirectDeposit;
  ddText: string | null;
  balance: { amount: number; holdDays: number | null } | null;
  transactions: number | null;
  promoCode: string | null;
  payoutDays: number | null;
  extraReqText: string | null;
  pull: Pull;
  pullText: string | null;
  chexPulls: 'yes' | 'no' | 'mixed' | 'unknown';
  chexSensitive: boolean;
  chexText: string | null;
  /** The bank's reported sensitivity to recently opened accounts (data/chex.json), when known. */
  chex?: {
    sensitive: boolean | null;
    /** Reported denials: [accounts opened, within months]. */
    limits: [number, number][];
    note: string | null;
    /** Checks Early Warning Services too. */
    ews: boolean;
    /** Looked up by Gemini with web search, not by hand. */
    ai: { on: string | null; sources: string[] } | null;
  } | null;
  ccFunding: number | null;
  ccText: string | null;
  monthlyFee: { amount: number | null; avoidable: boolean | null };
  monthlyFeeText: string | null;
  eatf: { fee: number | null; days: number | null; forfeit: boolean };
  eatfText: string | null;
  householdText: string | null;
  requirements: string[];
  verdict: string[];
  hasGlance: boolean;
}

export interface DealsFile {
  source: string;
  sourceUpdated: string;
  fetchedAt: string;
  deals: Deal[];
}

/** One bonus level of a deal: what it pays and everything it takes. */
export interface Level {
  bonus: number;
  how: string | null;
  dd: DirectDeposit;
  balance: Deal['balance'];
  transactions: number | null;
  extras: string[];
  fee: Fee;
}

/** One way to keep a monthly fee waived. */
export type FeeWaiver =
  | { kind: 'dd'; amount: number }
  | { kind: 'bal'; amount: number }
  | { kind: 'tx'; count: number; how: string }
  | { kind: 'free'; how: string };

export interface Fee {
  /** Monthly fee once anything free (eStatements...) is done; 0 = none. */
  monthly: number;
  /** Months at the start with no fee. */
  freeMonths: number;
  waivers: FeeWaiver[];
  once: { amount: number; how: string } | null;
  note: string | null;
}
