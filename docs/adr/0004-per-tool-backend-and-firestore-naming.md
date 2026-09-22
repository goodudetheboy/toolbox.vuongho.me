# 0004. Backend/database added per-tool only when needed, namespaced by naming convention

Status: Accepted

## Context

Most tools in this toolbox are expected to be purely client-side, but some
may eventually need server-side logic or persistent storage. Since all
tools share one GCP project (see
[0002](0002-shared-gcp-project-vuonghome.md)), resources from different
tools — and eventually different `*.vuongho.me` subdomains — live in the
same flat Cloud Run / Firestore namespace and could collide or become
confusing without a convention.

## Decision

- No shared backend service. A tool gets its own Cloud Run service only
  when it actually needs server-side logic, named `toolbox-<tool>-api`,
  region `us-central1`.
- A tool gets its own Firestore database only when it needs persistent
  storage, using Firestore's multi-database feature (Native mode), named
  `toolbox-<tool>`, region `us-central1` — not shared collections in one
  database.
- The `toolbox-` prefix identifies resources belonging to this subdomain's
  repo specifically; a future subdomain (e.g. `blog.vuongho.me`, its own
  repo) would use its own prefix (`blog-<tool>-api`, etc.) in the same
  `vuonghome` project.

## Consequences

- Idle cost stays near zero — Cloud Run scales to zero, Firestore is
  pay-per-use, so tools that never need a backend never provision one.
- Each tool's backend/data footprint is self-contained and named
  predictably, so `gcloud`/Firebase console listings stay legible even as
  the number of tools (and subdomains sharing this project) grows.
- Firestore's database *location* is permanent once created — `us-central1`
  is a deliberate default for every future tool database, not a
  per-tool choice to revisit casually.
