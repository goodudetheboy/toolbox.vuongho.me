# 0003. One Firebase Hosting site for toolbox.vuongho.me, path-based routing between apps

Status: Accepted

## Context

The homepage needs to link to each tool, and each tool needs a "back to
toolbox" link — that only works cleanly if the homepage and every tool live
under one domain. Firebase Hosting maps one custom domain to one Hosting
site; it has no built-in way to route a *path* on one domain to a different
site's static content (only to Cloud Run/Functions via rewrites). So
per-app Hosting sites (e.g. one site per tool) would have forced either
per-tool subdomains (`pdf-redactor.toolbox.vuongho.me`, breaking the
same-domain nav requirement) or real added complexity.

## Decision

One Hosting site for the whole `toolbox.vuongho.me` domain — site ID
`toolbox-vuonghome` (Firebase Hosting site IDs are globally unique across
*all* Firebase projects, not just this account's, so the plain `toolbox`
ID was already taken by someone else; the deploy target alias in
`.firebaserc` is still named `toolbox` locally).
Each app still builds independently (own `apps/<name>/dist`), but
[`scripts/combine-dist.mjs`](../../scripts/combine-dist.mjs) merges every
app's build output into one root `dist/` before deploy — homepage's build
lands at `dist/`, each tool's build lands at `dist/<tool-name>/`. Each
tool's `vite.config.ts` sets `base: '/<tool-name>/'` so its asset URLs
resolve under that path prefix. Cross-app navigation is plain `<a>` links
(full page loads) — no client-side router, since each tool is a
self-contained page.

This is separate from [0002](0002-shared-gcp-project-vuonghome.md)'s
multi-site usage: Hosting multi-site separates *subdomains* sharing the
`vuonghome` project (`toolbox` vs. a future `blog` site); path-based routing
via the combine step separates *apps within* this one subdomain.

## Consequences

- Homepage and every tool share one real domain, so plain relative-path
  links work both ways without CORS/domain concerns.
- Adding tool #3 is a small diff: one more `apps/<name>` package, one more
  `vite.config.ts` `base`, no `firebase.json`/`.firebaserc` change (the
  combine script picks up any new `apps/*/dist` automatically).
- The combine step is a real build stage that must run before every deploy
  (`npm run build && npm run combine`) — forgetting it means deploying a
  stale or incomplete `dist/`. Encoded into the CI workflow
  ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)) so
  it isn't a manual step to remember.
