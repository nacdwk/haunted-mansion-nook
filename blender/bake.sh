#!/bin/sh
# Rebuild the baked Grand Hall: model and light-bake it in Blender, then write web-ready files to assets/.
# Needs Blender 4.2+ (set BLENDER=/path/to/blender if it isn't on your PATH) and Python 3 with Pillow.
# Extra arguments go to the Blender script, e.g.  blender/bake.sh --size 2048 --samples 256
# Full-size PNG lightmaps are kept in blender/build/ (not committed), so `blender/bake.sh --encode-only`
# can re-encode them at a different WebP quality without baking again.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-blender}
QUALITY=${QUALITY:-80}
mkdir -p blender/build assets
if [ "$1" != "--encode-only" ]; then
  "$BLENDER" -b --factory-startup -P blender/grand_hall.py -- --out blender/build "$@"
fi
python3 - blender/build assets "$QUALITY" <<'EOF'
import sys
from PIL import Image
src, dst, q = sys.argv[1], sys.argv[2], int(sys.argv[3])
for name in ('warm', 'cool'):
    Image.open(f'{src}/grandhall_{name}.png').convert('RGB').save(f'{dst}/grandhall_{name}.webp', 'WEBP', quality=q, method=6)
EOF
cp blender/build/grandhall.glb blender/build/grandhall.json assets/
ls -l assets
