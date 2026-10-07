# Cuts fix-throat.sh's edited stickers off the green and writes them back over the app assets,
# at the same sizes process.py uses, and rebuilds the app icons from the fixed calm head.
import sys, numpy as np
from PIL import Image
raw, app = sys.argv[1], sys.argv[2]

def cutout(name):
    a = np.asarray(Image.open(f'{raw}/fixed-{name}.png').convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = g - np.maximum(r, b)
    alpha = 1 - np.clip((key - 30) / (110 - 30), 0, 1)
    g = np.where(key > 0, np.minimum(g, np.maximum(r, b)), g)
    im = Image.fromarray(np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
    s = max(im.size) + 8
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return sq

for m in 'wave read listen hint cheer proud sleepy think'.split():
    cutout(m).resize((400, 400), Image.LANCZOS).save(f'{app}/src/assets/biggu/{m}.webp', quality=82, method=6)
for f in ('happy', 'sad'):
    cutout(f'face-{f}').resize((160, 160), Image.LANCZOS).save(f'{app}/src/assets/biggu/face-{f}.webp', quality=85, method=6)
for name in ('calm', 'wink', 'blep', 'tilt', 'content', 'smug', 'excited'):
    cutout(f'head-{name}').resize((160, 160), Image.LANCZOS).save(f'{app}/src/assets/biggu/heads/{name}.webp', quality=85, method=6)

head = cutout('head-calm')
def icon(size, frac, path, bg=(0xDC, 0xEF, 0xFB, 255)):
    c = Image.new('RGBA', (size, size), bg)
    h = head.resize((round(size * frac),) * 2, Image.LANCZOS)
    c.alpha_composite(h, ((size - h.width) // 2, (size - h.height) // 2))
    c.convert('RGB').save(path, optimize=True)
icon(192, 0.86, f'{app}/public/pwa-192.png')
icon(512, 0.86, f'{app}/public/pwa-512.png')
icon(512, 0.66, f'{app}/public/pwa-maskable-512.png')
icon(180, 0.86, f'{app}/public/apple-touch-icon.png')
head.resize((64, 64), Image.LANCZOS).save(f'{app}/public/favicon.png', optimize=True)
