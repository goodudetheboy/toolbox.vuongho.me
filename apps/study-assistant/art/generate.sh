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
  # Header heads: generated with raw-head.png (not style-ref.png) as the first reference so they match it.
  [head-wink]="Head only (no body), facing the viewer, same framing as the first reference. Expression: a playful wink — one eye closed, the other open, a little smile."
  [head-blep]="Head only (no body), facing the viewer, same framing as the first reference. Expression: a cute 'blep': the tip of a small pink tongue poking out, eyes open and innocent."
  [head-tilt]="Head only (no body), same framing as the first reference. Expression: curious, head tilted to one side, eyes big and round, ears forward."
  [head-content]="Head only (no body), facing the viewer, same framing as the first reference. Expression: blissfully content, eyes closed in slow happy curves, tiny smile, soft rosy cheeks, like purring."
  [head-smug]="Head only (no body), facing the viewer, same framing as the first reference. Expression: a cheeky smug look, eyes half-lidded, one corner of the mouth up."
  [head-excited]="Head only (no body), facing the viewer, same framing as the first reference. Expression: excited and delighted, eyes wide and sparkly, small open-mouth smile, ears perked up."
)
# Not Biggu: Vpork (the user, signing a rare cram-sheet note), drawn in Biggu's style from his calm
# head (raw-head.png) plus a selfie. The selfie isn't committed: pass it as VPORK_PHOTO=/path/to.jpg.
VPORK="Head only (no body, no shoulders) of the young man in the second reference photo, facing the viewer, same framing and size as the reference cat head. Keep his likeness: short spiky black hair, dark eyes, the small mole under his right eye (viewer's left), round cheeks, a big warm loving smile. Make it cute and flattering: eyes gently smiling, rosy blush on the cheeks, a tiny pink paper heart floating beside his head. Normal proportions, not the wide-angle distortion of the selfie. Draw it in exactly the same style as the first reference illustration: colored-pencil / gouache texture, visible paper grain, hand-drawn semi-realistic but cute — not a photo, not 3D, not chibi, not anime, not a cartoon emoji. The head (and the little heart) is cut out with a thick, slightly imperfect hand-cut WHITE paper border around the silhouette, like a cutout glued into a collage. IMPORTANT: the background must be a perfectly flat, uniform pure chroma-key green (#00FF00) filling everything outside the white border — no drop shadow, no gradient, no texture, no text. Centered with a little green margin on all sides."
if [[ " $* " == *" vpork "* ]]; then
  node gen.mjs "$OUT/raw-vpork.png" "$VPORK" "$OUT/raw-head.png" "${VPORK_PHOTO:?set VPORK_PHOTO to the selfie}"
  set -- $(printf '%s\n' "$@" | grep -vx vpork)
  [[ $# -eq 0 ]] && { "${PY:-python3}" process.py "$OUT" "$APP"; exit; }
fi
for m in "${@:-${!POSE[@]}}"; do
  ref=style-ref.png; [[ $m == head-* ]] && ref="$OUT/raw-head.png"   # run 'head' first if regenerating these
  node gen.mjs "$OUT/raw-$m.png" "$CAT ${POSE[$m]} $STYLE" "$ref" biggu-photo.jpg &
done
wait
"${PY:-python3}" process.py "$OUT" "$APP"
