# 0001. Cross-origin isolation headers scoped to `/audio-transcriber/**` only

Status: Accepted

## Context

The `audio-transcriber` tool (migrated from its own standalone repo/deploy at
`audio-transcriber.vuongho.me`, see
[docs/progress/20260921.md](../progress/20260921.md)) needs
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` on every response — its
standalone deploy set these via `vercel.json`, required for ffmpeg.wasm and
`@huggingface/transformers`'s WebGPU/WASM backends to work correctly in the
browser. No other tool in this toolbox needs these headers, and applying
`Cross-Origin-Embedder-Policy` site-wide is risky by default: it blocks
loading any cross-origin subresource that doesn't explicitly opt in via CORP/
CORS, which could silently break a future tool that embeds a cross-origin
image, font, or script.

## Decision

Scope the headers to this one tool's path in
[`firebase.json`](../../../../firebase.json)'s `hosting.headers`, matching on
`source: "/audio-transcriber/**"`, rather than applying them to the whole
Hosting site.

## Consequences

- Every other tool (current and future) is unaffected by COEP's cross-origin
  subresource restrictions unless it explicitly opts in the same way.
- Adding a tool with the same requirement means adding another scoped
  `headers` entry, not touching this one.
- If `audio-transcriber` ever needs to open a popup/window with a
  cross-origin page that relies on `window.opener` (COOP blocks this), that
  would need revisiting — not a known need today.

## Addendum: local `firebase serve`/emulator doesn't apply `headers` at all

Discovered while verifying this migration: neither `firebase-tools serve
--only hosting` nor `firebase-tools emulators:start --only hosting` applies
any `hosting.headers` rule locally — confirmed with a deliberately broad
`"source": "**"` test rule that still didn't show up on any response. This
is a limitation of the local static server itself, not specific to this
rule's glob or to using a hosting `target`. **Real deployed Hosting does
apply it** — verified by deploying to a temporary preview channel
(`firebase hosting:channel:deploy`) and confirming
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` were present on
`/audio-transcriber/**` responses and absent elsewhere, then deleting the
channel. Anyone touching `hosting.headers` in the future needs a preview
channel (or a real deploy) to verify it — `npm run build && npm run combine
&& firebase-tools serve` alone will not catch a broken headers rule.
