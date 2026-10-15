// Fixtures are trimmed real Doctor of Credit text, so a regression here means a
// real deal would be misread.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlToLines, findDates, extensionDates, parseDirectDeposit, parseBalance, parseTransactions,
  parsePromoCode, parseEatf, parseMonthlyFee, parseCcFunding, findStates, bankName, titleBonus,
  requirementAmounts, parseIndex, parseDeal,
} from './parse-deals.mjs';

test('htmlToLines drops struck-through text and decodes entities', () => {
  const lines = htmlToLines('<p>Extended to <del>September 30, 2026</del> November 30, 2026</p><ul><li>Can&#8217;t &amp; won&rsquo;t</li></ul>');
  assert.deepEqual(lines, ['Extended to November 30, 2026', 'Can’t & won’t']);
  assert.deepEqual(htmlToLines('<p>Expiration date: <s>9/30/22</s> None</p>'), ['Expiration date: None']);
});

test('findDates resolves year-less dates forward from the note date', () => {
  assert.deepEqual(findDates('back until 9/30', '2026-08-26').map((d) => d.date), ['2026-09-30']);
  assert.deepEqual(findDates('until 1/15', '2026-12-01').map((d) => d.date), ['2027-01-15']);
  assert.deepEqual(findDates('Extended to 1-31-27').map((d) => d.date), ['2027-01-31']);
  assert.deepEqual(findDates('valid through December 31st, 2026').map((d) => d.date), ['2026-12-31']);
});

test('extensionDates reads the newest note that names an end date, not the note date', () => {
  const pre = [
    'Update 10/2/26: Extended to 01/27/2027. There another version $900 checking bonus',
    'Update 7/14/26: Extended through 10/14/26',
  ];
  assert.deepEqual(extensionDates(pre, '2026-10-14'), ['2027-01-27']);
  assert.deepEqual(extensionDates(['Update 9/16/26: $500 in branch offer available from 9/16/26 through 9/19/26'], null), ['2026-09-19']);
  assert.deepEqual(extensionDates(['Update 6/14/26: $500 bonus available, seems to be in branch only.'], null), []);
});

test('direct deposit: bonus amounts are not mistaken for the deposit requirement', () => {
  const dd = parseDirectDeposit('Yes, no minimum. Click here to view what triggers this bonus.', [
    'Receive a bonus of $300 when you open a Chase Total checking account and have a direct deposit post to the account within 90 days.',
  ], []);
  assert.equal(dd.required, true);
  assert.equal(dd.amount, 0);
  assert.equal(dd.windowDays, 90);
  assert.deepEqual(requirementAmounts('$3,000 or more for the $325 bonus'), [3000]);
});

test('direct deposit: per-month and per-deposit amounts become totals', () => {
  assert.equal(parseDirectDeposit('Yes, $500+ and recurring for 3 months out of 4', [], []).amount, 1500);
  const psecu = parseDirectDeposit('Yes', ['Set up and receive two (2) qualifying payroll direct deposits each of $500 or more.'], []);
  assert.equal(psecu.amount, 1000);
  assert.equal(psecu.minDeposits, 2);
  const figfcu = parseDirectDeposit('Yes, $5,000+ per month for three consecutive months', [
    '$250 Bonus when you open a FIGFCU High Yield Checking account and post 3+ separate ACH Direct Deposits with a cumulative total of $15,000 or more in the first 90 days of account opening.',
  ], []);
  assert.equal(figfcu.amount, 15000);
  assert.equal(figfcu.windowDays, 90);
  assert.equal(figfcu.minDeposits, 3);
  // "each month" is per month, not per deposit.
  assert.equal(parseDirectDeposit('Yes', ['You must have at least $1,000 in direct deposits each month for two consecutive months'], []).amount, 2000);
});

test('direct deposit not required', () => {
  for (const t of ['No', 'None', 'Optional', 'Not required']) assert.equal(parseDirectDeposit(t, [], []).required, false);
});

test('balance requirement with hold period; opening deposits ignored', () => {
  assert.deepEqual(parseBalance([
    'Receive a bonus of $200 when you open a Chase savings account and deposit $15,000 or more in new money within 30 days and and maintain a $15,000 balance for 90 days from offer enrollment',
  ]), { amount: 15000, holdDays: 90 });
  assert.equal(parseBalance(['Open an interest checking account with a $500 minimum']), null);
});

test('transactions, promo code', () => {
  assert.equal(parseTransactions(['Complete at least 15 debit card transactions']), 15);
  assert.equal(parseTransactions(['Make ten (10) or more debit or credit card purchase2 transactions']), 10);
  assert.equal(parseTransactions(['Receive $1,000 in direct deposits']), null);
  assert.equal(parsePromoCode(['Use promo code CAP2026']), 'CAP2026');
  assert.equal(parsePromoCode(['Open a new Checking and Savings account – Use code MATCH in person or online']), 'MATCH');
});

test('glance fields: EATF, monthly fee, card funding', () => {
  assert.deepEqual(parseEatf('Six months, bonus forfeit'), { fee: 0, days: 180, forfeit: true });
  assert.deepEqual(parseEatf('$25, 90 days'), { fee: 25, days: 90, forfeit: false });
  assert.deepEqual(parseEatf('None listed'), { fee: 0, days: null, forfeit: false });
  assert.deepEqual(parseMonthlyFee('$12, avoidable'), { amount: 12, avoidable: true });
  assert.deepEqual(parseMonthlyFee('$4, not avoidable'), { amount: 4, avoidable: false });
  assert.equal(parseCcFunding('Up to $1,000 with Visa, Mastercard or Discover.'), 1000);
  assert.equal(parseCcFunding('None'), 0);
  assert.equal(parseCcFunding('Unknown'), null);
});

test('states, bank names, title bonus', () => {
  assert.deepEqual(findStates('Rogue Credit Union – $500 -OR, ID, Northern CA'), ['CA', 'ID', 'OR']);
  assert.deepEqual(findStates('Municipal Credit Union – NYC $350 Bonus'), ['NY']);
  assert.deepEqual(findStates('Horizon Bank – $250 – IN, MI, In Branch only'), ['IN', 'MI']);
  assert.deepEqual(findStates('Fulton Bank $500 – DE, D.C., MD'), ['DC', 'DE', 'MD']);
  assert.equal(bankName('PSECU $300 Checking Bonus'), 'PSECU');
  assert.equal(bankName('HSBC Up To $1,500-$7,000 Checking Bonus'), 'HSBC');
  assert.equal(bankName('Simmons Bank – $900 Checking Bonus – AR, TX'), 'Simmons Bank');
  assert.equal(bankName('Visions Federal Credit Union – NY, PA, NJ – $500'), 'Visions Federal Credit Union');
  assert.equal(bankName('Provident Bank – NJ, NY & PA $300'), 'Provident Bank');
  assert.equal(bankName('Municipal Credit Union – NYC $350 Bonus'), 'Municipal Credit Union');
  assert.deepEqual(titleBonus('Bank of America $400-$2,500').amounts, [400, 2500]);
  assert.equal(titleBonus('American Express Business Checking 35,000 Points').points, 35000);
});

test('parseIndex + parseDeal end to end', () => {
  const index = `
    <h2>Best Checking Account Bonuses</h2>
    <h3>Wells Fargo $500 Checking Bonus</h3>
    <p><a href="https://example.com/wf">Direct link to offer</a></p>
    <p>Can be opened online. Requires $1,000 direct deposit.</p>
    <p><a href="https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/">Read our full post</a></p>
    <ul><li>Soft pull</li><li>$1,000 direct deposit required</li></ul>`;
  const [entry] = parseIndex(index);
  assert.equal(entry.category, 'checking');
  assert.deepEqual(entry.slugs, ['wells-fargo-500-checking-bonus']);
  const post = {
    slug: 'wells-fargo-500-checking-bonus',
    link: 'https://www.doctorofcredit.com/wells-fargo-500-checking-bonus/',
    modified_gmt: '2026-10-06T12:00:00',
    content: { rendered: `
      <p>Update 9/1/26: Extended to <del>9/30/26</del> 12/31/26.</p>
      <p><strong>Offer at a glance</strong></p>
      <ul>
        <li><strong>Maximum bonus amount:</strong> $500</li>
        <li><strong>Availability:</strong> Nationwide</li>
        <li><strong>Direct deposit required:</strong> Yes, $1,000+</li>
        <li><strong>Hard/soft pull:</strong> Soft pull</li>
        <li><strong>ChexSystems:</strong> Yes, sensitive</li>
        <li><strong>Credit card funding:</strong> None</li>
        <li><strong>Monthly fees:</strong> $10, avoidable</li>
        <li><strong>Early account termination fee:</strong> $25, 180 days</li>
        <li><strong>Household limit:</strong> One</li>
        <li><strong>Expiration date:</strong> October 6, 2026</li>
      </ul>
      <h2>The Offer</h2>
      <p>Direct link to offer</p>
      <p>Wells Fargo is offering a $500 bonus when you complete the following requirements:</p>
      <ul><li>Receive a total of $1,000 or more in qualifying direct deposits within 90 calendar days from account opening</li></ul>
      <h2>The Fine Print</h2>
      <p>Bonus will be deposited within 30 days after the qualification period.</p>
      <h2>Our Verdict</h2><p>Easy bonus. Hat tip to reader X</p>` },
  };
  const d = parseDeal(entry, post);
  assert.equal(d.bank, 'Wells Fargo');
  assert.equal(d.bonusMax, 500);
  assert.equal(d.expires, '2026-12-31');
  assert.equal(d.nationwide, true);
  assert.deepEqual([d.dd.required, d.dd.amount, d.dd.windowDays], [true, 1000, 90]);
  assert.equal(d.pull, 'soft');
  assert.equal(d.chexSensitive, true);
  assert.deepEqual(d.eatf, { fee: 25, days: 180, forfeit: false });
  assert.equal(d.payoutDays, 30);
  assert.deepEqual(d.verdict, ['Easy bonus.']);
  assert.equal(d.ended, false);
});

test('glance "DD: No" is overridden only by a flat DD requirement with no alternative', () => {
  const suffolk = ['get $250 when you make qualifying direct deposits totaling $2,500 or more within your first 90 days'];
  assert.equal(parseDirectDeposit('No', suffolk, []).required, true);
  const midfirst = ['complete one of the following requirements within 90 days of opening', 'Receive at least $1,000 in direct deposits'];
  assert.equal(parseDirectDeposit('No', midfirst, []).required, false);
  assert.equal(parseDirectDeposit('No', ['Direct deposit to your account OR an average of 12 transactions'], []).required, false);
});

test('balance tiers are read from "$X bonus: $Y+" lists', async () => {
  const { parseBalanceTiers } = await import('./parse-deals.mjs');
  assert.deepEqual(parseBalanceTiers([
    'The bonus you receive depends on Average Collected Balance in the account from Day 30 to Day 90.',
    '$400 bonus: $4,000 – $24,999.99',
    '$1,000 bonus: $50,000+',
  ]), [{ bonus: 400, amount: 4000 }, { bonus: 1000, amount: 50000 }]);
});

test('payout days ignore clawback sentences', async () => {
  const { parsePayoutDays } = await import('./parse-deals.mjs');
  assert.equal(parsePayoutDays(['We reserve the right to deduct the bonus amount if the account is closed within 12 months of opening.']), null);
  assert.equal(parsePayoutDays(['Your bonus will be deposited into your account within 60 days of meeting the requirements.']), 60);
});
