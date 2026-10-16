# 0013. Gemini reads new or changed deal terms

Status: Accepted (amends ADR 0012)

## Context

ADR 0012's hand-checked terms age: when Doctor of Credit rewrites a post or
adds a deal, its hash stops matching and the deal falls back to the regex
parser until someone reads it again. The user wanted that re-read automated,
and chose Gemini over a weekly Claude task or the Claude API: CI's Google Cloud service account can call it through
Vertex AI with no API key.

## Decision

- Once a month, on the first Monday's scheduled deploy, and on manual runs
  of the Deploy workflow; never on a push or the other weekly runs (the
  user's call), `refresh-deals.mjs` sends every deal whose hash doesn't match its entry
  in `data/deal-terms.json`, and that has a post, is sent to Gemini
  (`scripts/ai-terms.mjs`, `gemini-3.8-flash` on Vertex AI in `vuonghome`,
  temperature 0, a fixed JSON schema). At most 60 per run.
- The prompt carries ADR 0012's reading rules, plus two learned from testing:
  read "The Offer" section, not the "Update" history at the top; read only
  the offer the title names (no referral or other-product bonuses), adding
  up parts the title combines.
- The answer must hold up before it's used: the upfront amount must be in the
  post (or two of its amounts added up, or points at 1¢), a parked balance
  must be in the post, a deposit window must be 1-400 days. Otherwise the deal
  stays unchecked and the run logs a warning.
- Entries are saved with `by: "gemini"` and the date; the deal page says the
  terms were read by AI, not by hand. CI commits `deal-terms.json` back to
  main (GITHUB_TOKEN, so it doesn't start another deploy) so the same deals
  aren't read again.
- Auth: `GEMINI_TOKEN` from `gcloud auth print-access-token` (the deploy
  service account `github-actions-deploy` has `roles/aiplatform.user`; the
  Vertex AI API was enabled on 2026-10-16). Locally, the script uses your
  own gcloud login; `CHURN_AI_TERMS=0` turns it off.

## Consequences

- Tested against 38 hand-checked deals (half picked from the tricky ones:
  later money, or a headline different from the upfront amount): 31 matched
  the hand-read upfront amount, 1 was refused by the checks, 6 differed,
  mostly on which tier counts. Gemini 3.1 Pro (preview) scored 32 and wasn't
  worth a preview model. So AI-read deals are close but not hand-quality,
  which is why the page flags them.
- Deals with no post (only the list's one-liner) aren't sent; there's
  nothing to read.
- Cost is a handful of small requests a month.
- A deal rewritten mid-week shows the automatic read until the next
  first-Monday run (or a manual run of the Deploy workflow).
