# 0001. Single repo, npm workspaces, one app per tool

Status: Accepted

## Context

This repo hosts a growing set of small, unrelated personal tools under
`toolbox.vuongho.me`. Two structures were considered: one repo per tool, or a
single monorepo. The tools are individually small (often a weekend build),
and the overhead of a separate repo, CI pipeline, and deploy config per tool
was judged not worth it — but each tool still needed to stay independent
(own dependencies, own styling/stack, no forced sharing) rather than becoming
tangled into one app.

## Decision

Single repo, npm workspaces (`apps/*`). Each tool is its own workspace
package under `apps/<tool-name>/` with its own `package.json`,
dependencies, and styling. Nothing is shared across apps unless explicitly
pulled into a common package later — there is no shared package yet.

## Consequences

- One `git clone`, one CI/CD pipeline, trivial to add tool #5 without new
  repo/CI/deploy setup.
- Each app can differ in stack if ever needed (default going forward is
  Vite + React + TypeScript, see 0005, but nothing enforces it).
- Losing: independent git history per tool, and independent
  open-source/hand-off of a single tool would require extracting it later
  rather than already living in its own repo.
