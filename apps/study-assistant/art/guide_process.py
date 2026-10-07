# Chroma-key the "How it works" illustrations (guide.sh) and export them as app assets.
# usage: guide_process.py <raw dir> <app dir>
import sys, os, numpy as np
from PIL import Image
raw, app = sys.argv[1], sys.argv[2]
os.makedirs(f'{app}/src/assets/guide', exist_ok=True)
for c in 'add recite hint result cram'.split():
    a = np.asarray(Image.open(f'{raw}/raw-guide-{c}.png').convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = g - np.maximum(r, b)                       # how "green-screen" a pixel is
    alpha = 1 - np.clip((key - 30) / (110 - 30), 0, 1)
    g = np.where(key > 0, np.minimum(g, np.maximum(r, b)), g)   # despill
    im = Image.fromarray(np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
    w = 720                                          # ~2x the card's width on a phone
    im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(f'{app}/src/assets/guide/{c}.webp', quality=80, method=6)
