# 0001. Trip Planner ships local-first now; shared auth + Firestore sync planned, blocked on GCP console access

Status: Implemented (see addendum below — the auth/sharing/sync portion
originally deferred here shipped 2026-09-24)

## Context

The user asked for a trip itinerary tool (`apps/trip-planner`) with:
- Sign-in via Google or email link (no password), meant to be reused by other
  tools in this toolbox later, not trip-planner-specific.
- Trip sharing, either read-only or edit (edit requires sign-in).
- Real-time collaborative editing similar to Google Docs, when two people
  edit the same itinerary at once.

All three require a live Firebase project (Authentication providers enabled,
a Firestore database, security rules, an authorized domain for
`toolbox.vuongho.me`) in the shared `vuonghome` GCP project (the toolbox-wide
[0002](../../../../docs/adr/0002-shared-gcp-project-vuonghome.md)). This session has no working
path to any of that: `gcloud` and `firebase` are not installed, and running
`npx firebase-tools serve` fails immediately with "Failed to authenticate,
have you run firebase login?" — the underlying Google OAuth/metadata calls
are also blocked by this environment's outbound network policy. Enabling
sign-in providers and creating a Firestore database are console/login-gated
steps with no way to complete them from here.

## Decision

**Ship now:** `trip-planner` works fully client-side, trip and activity data
in `localStorage` only (see `src/lib/storage.ts`, `src/lib/useTrips.ts`) —
one browser, one device, no account needed — with JSON export/import
(`src/lib/exportImport.ts`) as the interim way to back up or move data
between devices until real sync exists (see the addendum below). No backend
or Firestore database is provisioned yet; per the toolbox-wide
[0004](../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md)
that only happens once it's actually wired up, not speculatively.

**Planned, once GCP/Firebase console access is available** (the user said to
document this and continue later):

1. **Auth**: Firebase Authentication in the `vuonghome` project, with the
   Google provider and Email Link (passwordless) provider enabled. Per the
   user's request this is meant to be shared across tools, not owned by
   trip-planner — start it in `apps/trip-planner/src/lib/auth.ts`, and only
   extract it into a shared workspace package (breaking from the
   toolbox-wide [0001](../../../../docs/adr/0001-monorepo-npm-workspaces.md)'s
   "nothing shared yet" default) once a second tool actually needs sign-in.
   Requires: enabling both
   providers in the Firebase console, adding `toolbox.vuongho.me` as an
   authorized domain, and an OAuth consent screen for Google sign-in.

2. **Data**: Firestore database `toolbox-trip-planner` (Native mode,
   `us-central1`, per the toolbox-wide
   [0004](../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md)).
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
  to the toolbox-wide
  [0001](../../../../docs/adr/0001-monorepo-npm-workspaces.md)'s
  "independent by default" rule — call it out again in whichever future ADR
  actually extracts the shared auth package, so it doesn't read as an
  accidental deviation.

## Addendum: JSON export/import shipped as the interim backup/transfer path

Added `src/lib/exportImport.ts`: "Export" downloads every trip as one JSON
file; "Import" reads one back in and merges it by trip `id` (a matching id
overwrites, a new one is added). This doesn't give multi-device *sync* —
importing is a manual, one-shot action, not a live merge — but it does close
the immediate gap of trip-planner data being trapped on a single device/
browser profile while the real Firestore-backed sync above stays blocked.

## Addendum (2026-09-24): auth + Firestore sync + sharing, implemented

The GCP console blocker above is resolved — `gcloud`/`firebase` login access
now works, and the user separately enabled billing (`vuonghome` needed a
Cloud Billing account before Identity Platform/Auth could be initialized;
see the toolbox-wide root progress log for that account-level work). Built
the full plan from this ADR, with two adjustments discovered while
implementing:

**Infra provisioned** (`vuonghome` project): Firestore database
`toolbox-trip-planner` (Native mode, `us-central1`); a Firebase Web App for
the toolbox's client config; Identity Platform initialized; Email Link
(passwordless) and Google sign-in providers enabled; `toolbox.vuongho.me`
and `localhost` added as authorized domains. The Google OAuth client
(Client ID + secret, registered directly with Identity Toolkit's
`defaultSupportedIdpConfigs`) needed one extra manual step beyond what the
ADR anticipated: creating an OAuth consent screen and a Web-application
OAuth Client ID both require the Cloud Console UI — there is no public
API for either on a personal (non-org) GCP project. Everything else
(Firestore database, Firebase Auth config, security rules) was scriptable
via `gcloud`/the Identity Toolkit REST API.

**Read-only link ≠ a second secret token, by design, not by omission.**
This ADR's original text ("rules allow read when the request supplies the
matching token") isn't expressible in Firestore: a plain document `get()`
rule only sees `resource.data` and `request.auth` — there's no channel for
a client to submit an arbitrary token that a read rule can check. The
mechanism actually shipped: a trip has an `isShared: boolean` field: once
true, its document (and its `activities` subcollection) is publicly
readable by anyone who has the trip's own id — which is what the "view
link" (`?trip=<id>`) contains. The trip id itself, an unguessable
Firestore auto-id, *is* the capability; `isShared` is just the owner's
on/off switch for it. This is simpler than a parallel shareToken and is
exactly the kind of "simpler, sufficient" call this ADR already made for
sync below — recorded here since it's a deliberate deviation from this
document's original literal text, not an oversight.

**Edit link is a real second secret**, unlike the view link, because
Firestore *write* rules do get to see the client's submitted document
(`request.resource.data`), which a read rule cannot. Each trip also gets
an `editToken` (separate from its id). The edit link
(`?trip=<id>&edit=<token>`) requires sign-in; on load, the signed-in uid is
added to the trip's `editors` array via a transaction that Firestore's
security rules independently verify (`editToken` must match, `isShared`
must be true, and the write may only add the caller's own uid to
`editors` — nothing else). From then on that uid is a normal editor.

**Sync**: implemented as planned — per-activity Firestore documents
(`trips/{tripId}/activities/{activityId}`) with `onSnapshot` listeners, so
two editors on different activities never collide; last-write-wins on the
rare same-activity collision. No CRDT, per the ADR's original reasoning.

**Rules** live at `apps/trip-planner/firestore.rules`, deployed via
`firebase deploy --only firestore:rules --project vuonghome` (this needed
adding a `firestore` array entry — keyed by database id — to the root
`firebase.json`, since this is the toolbox's first tool with its own
Firestore database). Verified directly against the deployed rules, not
just the client UI: an unauthenticated `PATCH` straight to the Firestore
REST API against a shared trip's document returns `403
PERMISSION_DENIED`, confirming the access control is enforced
server-side.

**Client**: `src/lib/firebase.ts` (app/auth/Firestore init — the Firestore
instance is explicitly bound to the `toolbox-trip-planner` database, not
the project's `(default)` one), `src/lib/auth.ts` (Google popup +
email-link sign-in, shared-across-tools per this ADR's own call, so it's
not namespaced to trip-planner internally), `src/lib/cloud.ts` (all
Firestore reads/writes/subscriptions). `useTrips` now merges local
(`localStorage`) and cloud (Firestore) trips into one list; a local trip
gains a `cloud` field the first time its owner clicks "Go online",
after which it's the same trip id in Firestore going forward — additive,
not a migration, exactly as this ADR predicted the data-shape match would
allow.

**Verified**: real end-to-end pass against the live `vuonghome` project
(not the emulator) — created a local trip, signed in via a real Firebase
email-link round trip (sent to and fetched from the user's actual inbox),
went online, added an activity, enabled sharing, opened the resulting view
link in a second, signed-out tab and confirmed the itinerary was fully
visible with zero edit affordances, and confirmed the REST-level write
rejection above. `tsc --noEmit`, `vite build`, and a full workspace
`npm run build && npm run combine` all passed; the production bundle was
also smoke-tested via `firebase-tools serve` per this repo's
Worker/module-loading rule (Firebase's SDK dynamic-imports some of its
internals).

**Not done**: no UI affordance yet to leave a trip's `editors` list or to
transfer ownership; an editor can currently edit a shared trip's
destination/dates but not its sharing settings (`isShared`/`editToken`
changes are owner-only, enforced in `firestore.rules`). Neither was asked
for; noted here in case a future session assumes otherwise.
