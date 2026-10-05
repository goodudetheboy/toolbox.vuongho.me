#!/usr/bin/env bash
# Regenerates every Biggu illustration + app icon with Gemini, then cuts them out.
# Needs gcloud access to vuonghome and Pillow + numpy (python3 -m venv /tmp/v && /tmp/v/bin/pip install pillow numpy; PY=/tmp/v/bin/python).
# Usage: apps/study-assistant/art/generate.sh [mood ...]   (no args = all). Review the results before committing.
set -euo pipefail
cd "$(dirname "$0")"
APP=$(cd .. && pwd)
OUT=${OUT:-/tmp/biggu-raw}; mkdir -p "$OUT"
export GEMINI_API_KEY=${GEMINI_API_KEY:-$(gcloud secrets versions access latest --secret study-assistant-gemini-key --project vuonghome)}

STYLE="Keep exactly the same cat, same drawing style and same paper-cutout look as the first reference image (the illustration): colored-pencil / gouache texture, visible paper grain, hand-drawn semi-realistic — not a photo, not 3D, not chibi. The whole figure (and any small props) is cut out with a thick, slightly imperfect hand-cut WHITE paper border around the silhouette, like a cutout glued into a collage. IMPORTANT: the background must be a perfectly flat, uniform pure chroma-key green (#00FF00) filling everything outside the white border — no drop shadow, no gradient, no texture, no floor, no text. Centered with a little green margin on all sides."
CAT="The cat (see the second reference photo) is a brown-grey mackerel tabby with dark stripes, a bold M on the forehead, pale green eyes, pinkish-terracotta nose, white chin and white throat patch, large upright ears."
declare -A POSE=(
  [wave]="Full body, sitting upright facing the viewer, one front paw raised in a friendly wave, gentle smile."
  [read]="Full body, sitting and holding a small open book with both front paws, eyes looking down at the pages, calm and focused."
  [listen]="Full body, sitting facing the viewer, ears perked straight up, eyes wide and attentive, head tilted slightly, two small curved sound-wave arcs drawn next to one ear."
  [hint]="Full body, sitting, one front paw raised as if offering an idea, kind helpful smile, a small yellow lightbulb floating above its head."
  [cheer]="Full body, sitting with both front paws raised high in celebration, eyes squeezed shut in joy, big open-mouth smile, a few small paper stars and confetti around."
  [proud]="Full body, sitting tall with chest puffed out proudly, eyes gently closed, satisfied little smile, a small pink paper heart floating beside its head."
  [sleepy]="Full body, curled up in a loaf pose, eyes closed asleep, peaceful, a few small letter Z shapes floating above."
  [think]="Full body, sitting with one front paw touching its chin, eyes looking up to the side thoughtfully, a small thought bubble with three dots above its head."
  [happy]="Head only (no body), facing the viewer, very happy: eyes squeezed into joyful curves, rosy blush on cheeks, open smiling mouth."
  [sad]="Head only (no body), facing the viewer, sad: worried eyebrows, big glossy eyes, small frown, one tear on the cheek."
  [head]="Head only (no body), facing the viewer, friendly relaxed expression with a slight smile, eyes open — this will be an app icon."
)
for m in "${@:-${!POSE[@]}}"; do
  node gen.mjs "$OUT/raw-$m.png" "$CAT ${POSE[$m]} $STYLE" style-ref.png biggu-photo.jpg &
done
wait
"${PY:-python3}" process.py "$OUT" "$APP"
