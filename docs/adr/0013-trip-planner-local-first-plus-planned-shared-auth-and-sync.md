# 0013. Trip Planner ships local-first now; shared auth + Firestore sync planned, blocked on GCP console access

Status: Proposed (auth/sharing/sync portion not yet implemented)

## Context

The user asked for a trip itinerary tool (`apps/trip-planner`) with:
- Sign-in via Google or email link (no password), meant to be reused by other
  tools in this toolbox later, not trip-planner-specific.
- Trip sharing, either read-only or edit (edit requires sign-in).
- Real-time collaborative editing similar to Google Docs, when two people
  edit the same itinerary at once.

All three require a live Firebase project (Authentication providers enabled,
a Firestore database, security rules, an authorized domain for
`toolbox.vuongho.me`) in the shared `vuonghome` GCP project
([0002](0002-shared-gcp-project-vuonghome.md)). This session has no working
path to any of that: `gcloud` and `firebase` are not installed, and running
`npx firebase-tools serve` fails immediately with "Failed to authenticate,
have you run firebase login?" — the underlying Google OAuth/metadata calls
are also blocked by this environment's outbound network policy. Enabling
sign-in providers and creating a Firestore database are console/login-gated
steps with no way to complete them from here.

## Decision

**Ship now:** `trip-planner` works fully client-side, trip and activity data
in `localStorage` only (see `src/lib/storage.ts`, `src/lib/useTrips.ts`) —
one browser, one device, no account needed. No backend or Firestore database
is provisioned yet; per [0006](0006-per-tool-backend-and-firestore-naming.md)
that only happens once it's actually wired up, not speculatively.

**Planned, once GCP/Firebase console access is available** (the user said to
document this and continue later):

1. **Auth**: Firebase Authentication in the `vuonghome` project, with the
   Google provider and Email Link (passwordless) provider enabled. Per the
   user's request this is meant to be shared across tools, not owned by
   trip-planner — start it in `apps/trip-planner/src/lib/auth.ts`, and only
   extract it into a shared workspace package (breaking from
   [0001](0001-monorepo-npm-workspaces.md)'s "nothing shared yet" default)
   once a second tool actually needs sign-in. Requires: enabling both
   providers in the Firebase console, adding `toolbox.vuongho.me` as an
   authorized domain, and an OAuth consent screen for Google sign-in.

2. **Data**: Firestore database `toolbox-trip-planner` (Native mode,
   `us-central1`, per [0006](0006-per-tool-backend-and-firestore-naming.md)).
   `trips/{tripId}` document (destination, date range, owner uid, an
   `editors: uid[]` array, a random `shareToken` for read-only links), with
   activities as a `trips/{tripId}/activities/{activityId}` subcollection.

3. **Sharing**:
   - Read-only link: `?share=<shareToken>`, no sign-in required. Firestore
     security rules allow read when the request supplies the matching token.
   - Edit link: requires sign-in (Google or email link); the signed-in uid
     gets added to the trip's `editors` array; rules require
     `request.auth.uid in resource.data.editors` for writes.

4. **Real-time sync** ("like Google Docs" — researched before deciding):
   real Google Docs uses Operational Transformation for character-level
   concurrent edits in free-flowing prose. This itinerary's data is
   structured (discrete activity records: time, title, category, tags), not
   prose, so full OT/CRDT machinery is more than the problem needs. The
   simpler, sufficient design: Firestore's built-in real-time listeners
   (`onSnapshot`) at per-activity-document granularity — each activity is its
   own document, so two people editing different activities (or different
   trips) never collide — plus optimistic local writes and server-timestamp
   last-write-wins for the rare case of the same activity edited at the same
   instant. This needs no separate sync server; Firestore's own realtime
   channel is the transport. If free-text collaborative editing within a
   single `description` field is wanted later, that one field is the
   documented spot to layer in a CRDT text type (e.g. Yjs) — not needed for
   the MVP.

## Consequences

- Today's `trip-planner` is genuinely useful standalone and nothing in it
  gets thrown away later: the local `Trip`/`Activity` shape
  (`src/types.ts`) already matches the planned Firestore document shape, so
  swapping `localStorage` for Firestore reads/writes is additive, not a
  rewrite.
- No multi-device sync, sharing, or collaborative editing until the
  Firebase console setup above is done by someone with `gcloud`/Firebase
  login access — this is the blocker, not remaining engineering work.
- Auth being shared across tools is a deliberate, user-requested exception
  to [0001](0001-monorepo-npm-workspaces.md)'s "independent by default"
  rule — call it out again in whichever future ADR actually extracts the
  shared auth package, so it doesn't read as an accidental deviation.
