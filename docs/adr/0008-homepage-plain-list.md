# 0008. Homepage back to a plain list; external tools allowed

Status: Accepted

## Context

ADR 0006 made the homepage a three.js + cannon-es garage scene. Its
addendums already made the plain list the default everywhere, with the 3D
scene behind an "Open the garage (3D)" button. The user doesn't use the
scene, and it was most of the homepage's code (~2,000 lines) and weight
(~1 MB lazy chunk).

Separately, the user wanted the Claude RC login page
(`claude-rc.vuongho.me`, code in `goodudetheboy/claude-rc`, running on the
homelab behind Cloudflare Access) listed on the homepage, though it isn't
built or deployed from this repo.

## Decision

- Delete the 3D scene (`apps/homepage/src/scene/`), its deps (`three`,
  `cannon-es`, `@types/three`), the list/3D toggle and its `toolbox.view`
  localStorage key. The homepage is the list view, unchanged in look.
- `ToolIcon.tsx` SVGs stay as the list's icons. The registry field is
  renamed `model` → `icon` (`ToolIconName`), since there are no 3D props
  any more.
- `tools.ts` entries may link off-site (absolute `href`). Claude RC is the
  first; it is not part of `npm run build`/`combine`, and its access control
  is Cloudflare's, not this site's.

## Consequences

- Adding a tool: add it to `tools.ts`, optionally with a new icon in
  `ToolIcon.tsx`. No scene slot or prop to make.
- Homepage JS is ~150 KB (~49 KB gzip), all in one chunk.
- The homepage is public, so listing Claude RC shows its hostname to
  visitors. The page itself needs the user's Cloudflare Access login.
