#!/usr/bin/env node
// Refreshes public/deals.json from Doctor of Credit's "Best Bank Account Bonuses"
// page and every post it links to. Uses the WordPress REST API so a full refresh is
// ~7 requests (the index + batches of posts) rather than one per deal, spaced out
// politely. See docs/adr/0001-deal-data-from-doc-rest-api.md.
//
//   node scripts/refresh-deals.mjs              # fetch live, write public/deals.json
//   CHURN_CACHE_DIR=/tmp/doc node scripts/...   # reuse/save raw API responses (dev)
//
// If the fetch fails the existing deals.json is left alone and the script exits 0
// with a warning, so a DoC outage never blocks a deploy (the app shows the data date).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIndex, parseDeal } from './parse-deals.mjs';
import { applyTerms } from './deal-terms.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public', 'deals.json');
const TERMS = path.join(here, '..', 'data', 'deal-terms.json');
const API = 'https://www.doctorofcredit.com/wp-json/wp/v2/posts';
const INDEX_SLUG = 'best-bank-account-bonuses';
const BATCH = 40;
const PAUSE_MS = 3000;
const UA = 'churn-machine/1.0 (personal tool at toolbox.vuongho.me; links every deal back to doctorofcredit.com)';
const cacheDir = process.env.CHURN_CACHE_DIR;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, cacheKey) {
  const cached = cacheDir && path.join(cacheDir, `${cacheKey}.json`);
  if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const json = await res.json();
      if (cached) {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cached, JSON.stringify(json));
      }
      await sleep(PAUSE_MS);
      return json;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(PAUSE_MS * 2 ** attempt);
    }
  }
}

const FIELDS = '_fields=slug,link,modified_gmt,content';

async function main() {
  const [indexPost] = await getJson(`${API}?slug=${INDEX_SLUG}&${FIELDS}`, 'index');
  if (!indexPost) throw new Error('index post not found');
  const entries = parseIndex(indexPost.content.rendered);
  if (entries.length < 20) throw new Error(`only ${entries.length} deals parsed from the index; page layout changed?`);

  const slugs = [...new Set(entries.flatMap((e) => e.slugs.slice(0, 1)))];
  const posts = new Map();
  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    const got = await getJson(`${API}?slug=${batch.join(',')}&per_page=100&${FIELDS}`, `posts-${i / BATCH}`);
    for (const p of got) posts.set(p.slug, p);
  }

  const terms = JSON.parse(readFileSync(TERMS, 'utf8'));
  const seen = new Set();
  const deals = [];
  for (const entry of entries) {
    const post = posts.get(entry.slugs[0]) ?? null;
    const parsed = parseDeal(entry, post);
    const deal = applyTerms(parsed, terms[parsed.id]);
    // The same post is sometimes listed under two headings (e.g. state + business);
    // keep the first, which is the higher-ranked spot.
    if (seen.has(deal.id)) continue;
    seen.add(deal.id);
    deals.push({ ...deal, rank: deals.length + 1 });
  }

  const out = {
    source: `https://www.doctorofcredit.com/${INDEX_SLUG}/`,
    sourceUpdated: indexPost.modified_gmt,
    fetchedAt: new Date().toISOString(),
    deals,
  };
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const missing = deals.filter((d) => !d.hasGlance).length;
  const unchecked = deals.filter((d) => !d.termsChecked).length;
  console.log(`wrote ${deals.length} deals to ${path.relative(process.cwd(), OUT)} (${missing} without an "offer at a glance" block, ${unchecked} new or changed since their terms were checked)`);
}

main().catch((err) => {
  console.warn(`::warning::churn-machine deal refresh failed, keeping the existing deals.json: ${err.message}`);
});
