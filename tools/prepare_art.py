"""Prepare the official Stretching Room portraits and the wallpapers for the site.

    python3 tools/prepare_art.py ~/Desktop/HM

Sources (not in this repo):
    2025-disney-store-strecthing-room-art{1,2,3,5}.webp   Disney Store product images of the four
                                                          stretching portraits (Disney artwork)
    hm_wallpaper.jpg                                      Panicked Pixie's recreation of the ride's
                                                          wallpaper, from Redbubble
    stretch_room_wallpaper.jpg                            a photo of the Stretching Room's striped
                                                          wallpaper

Writes assets/art/:
    stretch-{tightrope,dynamite,quicksand,widow}.webp     each painting cut from its white product
        background and trimmed on the left to 0.29 width-to-height, which is as wide as the
        Stretching Room's frames allow (the artist's signature at the bottom right is kept)
    wallpaper.webp, wallpaper-glow.webp                   one seamless repeat of the pattern
        (204 x 408 px, a half-drop), cleaned up to its three flat colours at twice the size,
        plus a mask of the eyes, which glow in the dark
    stretch-wallpaper.webp                                one repeat of the stripes (373 px), redrawn
        from the photo's column averages, so the photo's noise and uneven light drop out

Delete assets/art/ and the site falls back to its own painted portraits and wallpaper.
"""
import glob, os, sys
import numpy as np
from PIL import Image

src = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/Desktop/HM')
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art')
os.makedirs(out, exist_ok=True)

# ---- portraits: the painting fills columns 302..629 of each 932x932 product image
ASPECT = 0.29
for n, name in ((5, 'tightrope'), (1, 'dynamite'), (3, 'quicksand'), (2, 'widow')):
    im = Image.open(f'{src}/2025-disney-store-strecthing-room-art{n}.webp').convert('RGB')
    a = np.asarray(im)
    cols = np.where((a.min(axis=2) < 235).mean(axis=0) > 0.5)[0]
    x1 = int(cols.max()) + 1
    w = round(ASPECT * im.height)
    im.crop((x1 - w, 0, x1, im.height)).save(f'{out}/stretch-{name}.webp', 'WEBP', quality=90, method=6)

# ---- wallpaper: the pattern square sits at rows 125..874; it repeats every 204 px across and
#      408 px down (rows are offset by half a repeat), so any 204x408 window tiles seamlessly
path = (glob.glob(f'{src}/hm_wallpaper.jpg') or glob.glob(f'{src}/flat,*.jpg'))[0]
pattern = Image.open(path).convert('RGB').crop((0, 125, 750, 875))
tile = pattern.crop((100, 100, 304, 508))          # well away from the seller's mark at bottom right
big = np.asarray(tile.resize((204 * 4, 408 * 4), Image.LANCZOS)).astype(np.float32)
palette = np.array([[104, 86, 164], [12, 10, 26], [238, 236, 240]], np.float32)   # purple, black, white
cls = ((big[:, :, None, :] - palette[None, None]) ** 2).sum(axis=3).argmin(axis=2)
Image.fromarray(palette[cls].astype(np.uint8)).resize((408, 816), Image.LANCZOS) \
    .save(f'{out}/wallpaper.webp', 'WEBP', quality=90, method=6)
Image.fromarray(((cls == 2) * 255).astype(np.uint8)).resize((408, 816), Image.LANCZOS) \
    .save(f'{out}/wallpaper-glow.webp', 'WEBP', quality=90, method=6)

# ---- Stretching Room stripes: purely vertical, so average each column of the photo into one colour.
#      The sequence repeats every 373 px and the photo holds almost two repeats, which are averaged too.
a = np.asarray(Image.open(f'{src}/stretch_room_wallpaper.jpg').convert('RGB')).astype(np.float32)
prof = a[60:1040].mean(axis=0)
P, n = 373, prof.shape[0]
L = prof.mean(axis=1)
slope = (np.median(L[P:] / L[:n - P]) - 1) / P            # the photo brightens slightly across its width
prof = prof / (1 + slope * (np.arange(n) - n / 2))[:, None]
stripes = prof[:P].copy()
stripes[:n - P] = (prof[:n - P] + prof[P:]) / 2
step = np.abs(np.diff(np.r_[stripes.mean(axis=1), stripes[:1].mean(axis=1)]))
stripes = np.roll(stripes, -int(np.argmin(np.convolve(step, np.ones(15), mode='same'))), axis=0)   # wrap inside a broad stripe
Image.fromarray(np.repeat(stripes[None], 16, axis=0).clip(0, 255).astype(np.uint8)) \
    .save(f'{out}/stretch-wallpaper.webp', 'WEBP', lossless=True)

for f in sorted(os.listdir(out)):
    print(f'{f:28s} {os.path.getsize(os.path.join(out, f)) // 1024:4d} KB')
