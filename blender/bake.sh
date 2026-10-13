#!/bin/sh
# Rebuild a baked set: model and light-bake it in Blender, then write web-ready files to assets/.
#   blender/bake.sh grandhall --size 2048 --samples 256
#   blender/bake.sh exterior --size 2048 --cool-size 2048 --samples 256
#   blender/bake.sh grounds --size 1536 --cool-size 1536 --samples 256    (after exterior: it uses the house)
#   blender/bake.sh figures      (the caretaker and his dog: no lightmaps, their shading is in their vertex colours)
# Needs Blender 4.2+ (set BLENDER=/path/to/blender if it isn't on your PATH) and Python 3 with Pillow.
# Full-size PNG lightmaps are kept in blender/build/ (not committed), so `blender/bake.sh <set> --encode-only`
# re-encodes them at a different WebP quality without baking again (QUALITY=80 for the Grand Hall; the exterior and
# grounds use 70, which looks the same on their lightmaps and saves about 90 KB a set).
set -e
cd "$(dirname "$0")/.."
SET=${1:?which set: grandhall, exterior, grounds or figures}
shift
case "$SET" in
  grandhall) SCRIPT=blender/grand_hall.py; Q=80 ;;
  exterior) SCRIPT=blender/exterior.py; Q=70 ;;
  grounds) SCRIPT=blender/grounds.py; Q=70 ;;
  figures) SCRIPT=blender/figures.py ;;
  *) echo "unknown set: $SET" >&2; exit 1 ;;
esac
BLENDER=${BLENDER:-blender}
QUALITY=${QUALITY:-$Q}
mkdir -p blender/build assets
if [ "$1" != "--encode-only" ]; then
  "$BLENDER" -b --factory-startup --python-exit-code 1 -P "$SCRIPT" -- --out blender/build "$@"
fi
if [ "$SET" = figures ]; then
  cp blender/build/figures.glb assets/
  ls -l assets/figures.glb
  exit 0
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
