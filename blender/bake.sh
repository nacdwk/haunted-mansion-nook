#!/bin/sh
# Rebuild a baked set: model and light-bake it in Blender, then write web-ready files to assets/.
#   blender/bake.sh grandhall --size 2048 --samples 256
#   blender/bake.sh exterior --size 2048 --cool-size 2048 --samples 256
# Needs Blender 4.2+ (set BLENDER=/path/to/blender if it isn't on your PATH) and Python 3 with Pillow.
# Full-size PNG lightmaps are kept in blender/build/ (not committed), so `blender/bake.sh <set> --encode-only`
# re-encodes them at a different WebP quality without baking again (QUALITY=80 for the Grand Hall; the exterior
# uses 70, which looks the same on its lightmaps and saves about 90 KB).
set -e
cd "$(dirname "$0")/.."
SET=${1:?which set: grandhall or exterior}
shift
case "$SET" in
  grandhall) SCRIPT=blender/grand_hall.py; Q=80 ;;
  exterior) SCRIPT=blender/exterior.py; Q=70 ;;
  *) echo "unknown set: $SET" >&2; exit 1 ;;
esac
BLENDER=${BLENDER:-blender}
QUALITY=${QUALITY:-$Q}
mkdir -p blender/build assets
if [ "$1" != "--encode-only" ]; then
  "$BLENDER" -b --factory-startup --python-exit-code 1 -P "$SCRIPT" -- --out blender/build "$@"
fi
python3 - blender/build assets "$SET" "$QUALITY" <<'PY'
import sys
from PIL import Image
src, dst, name, q = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
for layer in ('warm', 'cool'):
    Image.open(f'{src}/{name}_{layer}.png').convert('RGB').save(f'{dst}/{name}_{layer}.webp', 'WEBP', quality=q, method=6)
PY
cp "blender/build/$SET.glb" "blender/build/$SET.json" assets/
ls -l assets/"$SET"*
