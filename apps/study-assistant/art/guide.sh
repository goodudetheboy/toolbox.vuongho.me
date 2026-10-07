#!/usr/bin/env bash
# Regenerates the "How it works" card illustrations (components/GuideCards.tsx) with Gemini:
# scrapbook collages of a hand-drawn phone showing the app, a hand / the student, and Biggu.
# References: style-ref.png, biggu-photo.jpg and a screenshot of the real screen
# (SHOTS dir, app-<screen>.png at 390x780 from the mock build — not committed).
# Usage: apps/study-assistant/art/guide.sh [card ...]  (no args = all). Review before committing.
set -euo pipefail
cd "$(dirname "$0")"
APP=$(cd .. && pwd)
OUT=${OUT:-/tmp/guide-raw}; SHOTS=${SHOTS:-$OUT}; mkdir -p "$OUT"
export GEMINI_API_KEY=${GEMINI_API_KEY:-$(gcloud secrets versions access latest --secret study-assistant-gemini-key --project vuonghome)}
export ASPECT=4:3

STYLE="Draw it as a cozy scrapbook collage in exactly the drawing style of the first reference illustration: colored pencil / gouache texture, visible paper grain, hand-drawn semi-realistic, warm and cute — not a photo, not 3D, not vector flat design, not anime. Every element is a separate hand-cut paper sticker with a thick, slightly imperfect WHITE paper border, a few bits of pastel washi tape (pink, mint, yellow, lilac, sky blue) and small doodles (pencil arrows, stars, sparkles) tie it together. The phone is a simple rounded smartphone drawn in colored pencil; its screen is a simplified hand-drawn version of the app screenshot in the third reference (same layout, colors and Biggu), on a pale sky-blue graph-paper background. NO readable words anywhere: draw any text as short soft pencil squiggle lines (a big number is fine only where asked). The cat is Biggu (second reference photo): a brown-grey mackerel tabby with dark stripes, a bold M on the forehead, pale green eyes, pinkish nose, white chin and throat. Biggu himself is the student using the app: NO people and NO human hands anywhere — whenever something holds or taps the phone, it is Biggu's own striped paw. IMPORTANT: the background must be a perfectly flat, uniform pure chroma-key green (#00FF00) filling everything outside the white sticker borders — no shadow, no gradient, no texture, no table. Landscape composition, centered, with a little green margin on all sides."
declare -A SHOT=([add]=add [recite]=speak [hint]=hint [result]=result [cram]=cram)
declare -A SCENE=(
  [add]="Biggu sits holding the phone upright in both front paws, looking at it, showing the 'How do you want to add it?' screen with its three big buttons (pink, yellow, mint). Flying into the phone with a pencil arrow: a sheet of handwritten class notes, a small PDF document page, and a tiny instant photo of a notebook. On the other side, the note comes out cut into three short torn paper strips, neatly taped in a row."
  [recite]="Biggu sits holding ONE big phone up in front of him with both front paws, its screen turned toward the viewer so we can see it: the listening screen (a tiny Biggu with ears up, a green striped progress bar, squiggle lines). He looks over the top of the phone with his mouth open, speaking aloud, a few hand-drawn sound-wave arcs and a small speech bubble with squiggles coming from his mouth. Exactly one phone in the whole picture — no second phone, no zoomed-in copy. A small book lies closed beside him, meaning he is reciting from memory."
  [hint]="The phone stands beside Biggu showing the listening screen: the on-screen Biggu has a little speech bubble containing a small yellow lightbulb and two squiggle words. At the bottom of the phone are two buttons side by side: a yellow Hint button with a lightbulb on the LEFT and a coral Done button on the RIGHT. Biggu reaches out and presses the YELLOW Hint button on the left with one striped paw (not the coral one), a thoughtful look on his face, a glowing yellow lightbulb floating above his head. A small hand-drawn stopwatch sticker with a '3' and a curved pencil arrow sits nearby, meaning 'pause about three seconds'."
  [result]="The phone shows the result screen: a taped score card with a big hand-written '82%', and a lined-paper note where the squiggle words are highlighted in soft green, a few in soft yellow, and a few in soft red-pink with a strike-through. Next to the phone, a small paper sticker of a bar chart with three bars rising and a gold star. Biggu sits tall and proud with chest puffed out, eyes gently closed, a small pink paper heart beside him."
  [cram]="The phone shows the cram-sheet screen: a stack of small taped paper cards, each with squiggle lines, a few bold words underlined in yellow highlighter, and round tick circles, some ticked. Behind the phone, a torn tear-off calendar page with one date circled in red pencil and a tiny pencil star. Biggu celebrates with both front paws raised high, eyes squeezed shut in joy, small paper confetti and stars around him."
)
for c in "${@:-${!SCENE[@]}}"; do
  node gen.mjs "$OUT/raw-guide-$c.png" "${SCENE[$c]} $STYLE" style-ref.png biggu-photo.jpg "$SHOTS/app-${SHOT[$c]}.png" &
done
wait
"${PY:-python3}" guide_process.py "$OUT" "$APP"
