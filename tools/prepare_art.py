"""Prepare the official Stretching Room portraits and the Endless Hall wallpaper for the site.

    python3 tools/prepare_art.py ~/Desktop/HM

Sources (not in this repo):
    2025-disney-store-strecthing-room-art{1,2,3,5}.webp   Disney Store product images of the four
                                                          stretching portraits (Disney artwork)
    flat,750x,075,f-pad,750x1000,f8f8f8.jpg               Panicked Pixie's recreation of the ride's
                                                          wallpaper, from Redbubble

Writes assets/art/:
    stretch-{tightrope,dynamite,quicksand,widow}.webp     each painting cut from its white product
        background and trimmed on the left to 0.29 width-to-height, which is as wide as the
        Stretching Room's frames allow (the artist's signature at the bottom right is kept)
    wallpaper.webp, wallpaper-glow.webp                   one seamless repeat of the pattern
        (204 x 408 px, a half-drop), cleaned up to its three flat colours at twice the size,
        plus a mask of the eyes, which glow in the dark

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
path = (glob.glob(f'{src}/flat,*.jpg') or glob.glob(f'{src}/*.jpg'))[0]
pattern = Image.open(path).convert('RGB').crop((0, 125, 750, 875))
tile = pattern.crop((100, 100, 304, 508))          # well away from the seller's mark at bottom right
big = np.asarray(tile.resize((204 * 4, 408 * 4), Image.LANCZOS)).astype(np.float32)
palette = np.array([[104, 86, 164], [12, 10, 26], [238, 236, 240]], np.float32)   # purple, black, white
cls = ((big[:, :, None, :] - palette[None, None]) ** 2).sum(axis=3).argmin(axis=2)
Image.fromarray(palette[cls].astype(np.uint8)).resize((408, 816), Image.LANCZOS) \
    .save(f'{out}/wallpaper.webp', 'WEBP', quality=90, method=6)
Image.fromarray(((cls == 2) * 255).astype(np.uint8)).resize((408, 816), Image.LANCZOS) \
    .save(f'{out}/wallpaper-glow.webp', 'WEBP', quality=90, method=6)

for f in sorted(os.listdir(out)):
    print(f'{f:28s} {os.path.getsize(os.path.join(out, f)) // 1024:4d} KB')
