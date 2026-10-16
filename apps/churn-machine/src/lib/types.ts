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
  /** Checked deals: the post's headline amount (bonusMax is then the upfront part only). */
  bonusListed?: number | null;
  /** Checked deals: what earns the upfront bonus, in a sentence. */
  bonusHow?: string | null;
  /** Money that needs a year or more of keeping deposits or balances going. Never counted. */
  later?: { amount: number; how: string }[];
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
