# Chroma-key the green background off Gemini's renders, crop, and export app assets.
# usage: process.py <raw dir> <app dir>
import sys, numpy as np
from PIL import Image
raw, app = sys.argv[1], sys.argv[2]

def cutout(name):
    a = np.asarray(Image.open(f'{raw}/raw-{name}.png').convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = g - np.maximum(r, b)                      # how "green-screen" a pixel is
    alpha = 1 - np.clip((key - 30) / (110 - 30), 0, 1)
    g2 = np.where(key > 0, np.maximum(r, b) + np.clip(key, 0, None) * 0.0, g)  # despill: green no higher than r/b
    out = np.dstack([r, np.minimum(g, g2), b, alpha * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    # drop near-invisible speckle, then crop to content and pad to a square
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
    s = max(im.size) + 8
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return sq

for m in 'wave read listen hint cheer proud sleepy think'.split():
    cutout(m).resize((400, 400), Image.LANCZOS).save(f'{app}/src/assets/biggu/{m}.webp', quality=82, method=6)
for f in ('happy', 'sad', 'head'):
    cutout(f).resize((160, 160), Image.LANCZOS).save(f'{app}/src/assets/biggu/face-{f}.webp', quality=85, method=6)

head = cutout('head')
def icon(size, frac, path, bg=(0xDC, 0xEF, 0xFB, 255)):
    c = Image.new('RGBA', (size, size), bg)
    h = head.resize((round(size * frac),) * 2, Image.LANCZOS)
    c.alpha_composite(h, ((size - h.width) // 2, (size - h.height) // 2))
    c.convert('RGB').save(path, optimize=True)
icon(192, 0.86, f'{app}/public/pwa-192.png')
icon(512, 0.86, f'{app}/public/pwa-512.png')
icon(512, 0.66, f'{app}/public/pwa-maskable-512.png')   # inside the 80% maskable safe zone
icon(180, 0.86, f'{app}/public/apple-touch-icon.png')
head.resize((64, 64), Image.LANCZOS).save(f'{app}/public/favicon.png', optimize=True)
