# Puts each existing Biggu asset on a flat green square for Gemini to edit (fix-throat.sh).
import sys, glob, os, numpy as np
from PIL import Image
app, out = sys.argv[1], sys.argv[2]
GREEN = (0, 255, 0, 255)
def on_green(im, name):
    im = im.convert('RGBA'); s = 1024; pad = 60
    k = (s - 2 * pad) / max(im.size)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    c = Image.new('RGBA', (s, s), GREEN); c.alpha_composite(im, ((s - im.width) // 2, (s - im.height) // 2))
    c.convert('RGB').save(f'{out}/src-{name}.png')
for f in glob.glob(f'{app}/src/assets/biggu/*.webp') + glob.glob(f'{app}/src/assets/biggu/heads/*.webp'):
    name = ('head-' if '/heads/' in f else '') + os.path.basename(f)[:-5]
    if name == 'head-calm': continue          # taken from the big app icon instead
    on_green(Image.open(f), name)
# The calm head at its largest: the 512 icon, minus its flat sky-blue background.
a = np.asarray(Image.open(f'{app}/public/pwa-512.png').convert('RGBA')).copy()
bg = (np.abs(a[..., :3].astype(int) - [0xDC, 0xEF, 0xFB]).sum(-1) < 12)
a[bg, 3] = 0
im = Image.fromarray(a); on_green(im.crop(im.getbbox()), 'head-calm')
