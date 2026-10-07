#!/usr/bin/env bash
# One-off edit (2026-10-07): Biggu's real coloring is a white chin with only a light peachy-orange
# tint on the throat below it — no big white bib, which every sticker had. Sends each existing asset
# to Gemini as an image edit (change only the throat), then cuts the results back into the app.
# Usage: apps/study-assistant/art/fix-throat.sh [name ...]   (names as in fix_prep.py's src-<name>.png)
set -euo pipefail
cd "$(dirname "$0")"
APP=$(cd .. && pwd)
OUT=${OUT:-/tmp/fix}; mkdir -p "$OUT"
export GEMINI_API_KEY=${GEMINI_API_KEY:-$(gcloud secrets versions access latest --secret study-assistant-gemini-key --project vuonghome)}
[[ -f "$OUT/src-wave.png" ]] || "${PY:-python3}" fix_prep.py "$APP" "$OUT"

EDIT="Edit the first image. Change ONLY the color of the fur on the cat's chin, throat and chest, to match the real cat in the second reference photo: keep the chin white, then just below it the throat has a very faint, light peachy-orange (pale apricot) wash — subtle, only a little warmer than the buff fur around it — blending into buff striped tabby fur on the chest. Remove any large white bib or white chest patch (replace it with that light peachy throat and buff tabby stripes). Keep EVERYTHING else exactly the same: the same pose, expression, eyes, face, ears, props, drawing style, colored-pencil texture, line work, the thick white paper-cutout border, the framing and size, and the perfectly flat pure green (#00FF00) background."
names=("$@"); [[ ${#names[@]} -gt 0 ]] || names=($(cd "$OUT" && ls src-*.png | sed 's/^src-//; s/\.png$//'))
HEAD=" This is a HEAD-ONLY sticker: do not add a neck, chest or body and do not change the silhouette — keep exactly the same head-only cutout shape with the white paper border all the way around; only recolor the small bit of white fur at the bottom of the chin/jaw so the chin stays white and any throat showing below it is the light peachy tint."
for n in "${names[@]}"; do
  prompt=$EDIT; [[ $n == head-* || $n == face-* ]] && prompt+=$HEAD
  node gen.mjs "$OUT/fixed-$n.png" "$prompt" "$OUT/src-$n.png" biggu-photo-2.jpg &
done
wait
"${PY:-python3}" fix_post.py "$OUT" "$APP"
