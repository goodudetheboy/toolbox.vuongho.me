# Study Assistant — one-time Google Cloud setup (no terminal needed)

Everything here is clicks in the Google Cloud console, Firebase console and
GitHub. Do the steps in order; it takes about 15 minutes. Until step 7 is
done, CI keeps deploying the rest of the toolbox exactly as before and the
study assistant page shows "The server isn't set up yet" when adding a note.

Project: **vuonghome** (project number `727499475710`). Region: **us-central1**.

---

## 1. Turn on the APIs

Open each link, make sure the project picker at the top says **vuonghome**,
and click **Enable** (skip any that already say "API enabled"):

1. Gemini API — https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=vuonghome
2. Cloud Run Admin API — https://console.cloud.google.com/apis/library/run.googleapis.com?project=vuonghome
3. Cloud Build API — https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=vuonghome
4. Artifact Registry API — https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=vuonghome
5. Secret Manager API — https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=vuonghome

## 2. Create a new Gemini API key just for this tool

1. Go to https://console.cloud.google.com/apis/credentials?project=vuonghome
2. **+ Create credentials → API key**. Copy the key it shows.
3. Click **Edit API key** (or the key's name in the list):
   - Name: `study-assistant-gemini`
   - **API restrictions → Restrict key →** tick only **Gemini API**
     (may be listed as "Generative Language API") → **Save**.
   - Leave "Application restrictions" as **None** (the key is only ever
     used by our server, never by a browser).

The project already has billing, so the key is on the paid Gemini tier
(needed for the live speech and voice models, and so notes aren't used for
training).

## 3. Put the key in Secret Manager

1. Go to https://console.cloud.google.com/security/secret-manager?project=vuonghome
2. **+ Create secret**
   - Name: `study-assistant-gemini-key` (exactly this — CI looks for it)
   - Secret value: paste the key from step 2
   - Leave everything else as is → **Create secret**.

## 4. Give the right accounts permission

Go to https://console.cloud.google.com/iam-admin/iam?project=vuonghome

**a) The GitHub deploy account** — the service account whose JSON key is in
the GitHub secret `GCP_SA_KEY`. In the IAM list it's the
`…@vuonghome.iam.gserviceaccount.com` principal that already has
**Firebase Hosting Admin**. Click its pencil icon → **+ Add another role**
for each of these, then **Save**:

- Cloud Run Admin
- Cloud Build Editor
- Artifact Registry Administrator
- Storage Admin
- Service Account User
- Service Usage Consumer
- Firebase Rules Admin  *(lets CI publish the database security rules)*

**b) The Cloud Run runtime account** —
`727499475710-compute@developer.gserviceaccount.com` (named "Compute Engine
default service account"; tick **Include Google-provided role grants** at the
top right if you don't see it). Pencil icon → add:

- Secret Manager Secret Accessor  *(so the server can read the key)*
- Cloud Run Builder  *(builds the server from source)*

## 5. Create the database

1. Go to https://console.cloud.google.com/firestore/databases?project=vuonghome
2. **+ Create database**
   - Database ID: `toolbox-study-assistant` (exactly this)
   - Mode: **Native mode**
   - Location type: **Region → us-central1**
   - Security rules: **Restrictive** (locked — CI publishes the real rules)
   - **Create database**.

## 6. Check sign-in is allowed on the site

Go to https://console.firebase.google.com/project/vuonghome/authentication/settings
→ **Authorized domains**. `toolbox.vuongho.me` should already be listed (the
trip planner uses it). If not, **Add domain** → `toolbox.vuongho.me`.
**Google** must be enabled under **Sign-in method** (it already is).

Only these two Google accounts can use the study assistant:
`hochivuong2002@gmail.com` and `tling241004@gmail.com`. To change the list,
edit both `apps/study-assistant/firestore.rules` and `ALLOWED_EMAILS` in
`.github/workflows/deploy.yml`.

## 7. Switch it on in GitHub

1. GitHub repo → **Settings → Secrets and variables → Actions → Variables**
   tab → **New repository variable**
   - Name: `STUDY_ASSISTANT_ENABLED`
   - Value: `true`
2. **Actions → Deploy →** open the latest run → **Re-run all jobs**.
   The first run takes ~5–8 minutes (it builds the server). Later pushes
   only rebuild the server when its code changes.

## 8. Try it

Open https://toolbox.vuongho.me/study-assistant/ on a phone, sign in, tap
**Add your first note → Paste text**, paste a paragraph, **Split into parts**,
open a part, **I'm ready — recite**, allow the microphone, and talk.

---

## If something goes wrong

- **Deploy run fails at "Deploy study-assistant API"** — the log names the
  missing permission; add that role to the deploy account (step 4a). A
  message about the secret means step 3 or 4b.
- **"The server isn't set up yet"** — the variable from step 7 isn't set, or
  the last Deploy run happened before it was set (re-run it).
- **"This account isn't on the list yet"** — signed in with another Google
  account; sign out and pick an allowed one.
- **"Something went wrong" when splitting a note** — check the server's logs:
  https://console.cloud.google.com/run/detail/us-central1/toolbox-study-assistant-api/logs?project=vuonghome
  A 403/404 from Gemini there usually means the key's API restriction
  (step 2) or that a model name changed — the models are set by env vars
  `TEXT_MODEL`, `LIVE_MODEL`, `TTS_MODEL`, `TTS_VOICE` on the Cloud Run
  service (defaults in `apps/study-assistant/api/index.js`).
