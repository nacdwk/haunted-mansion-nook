"""Build, light-bake and export the grounds around the mansion: the four dead trees, the graveyard (walls and
railings, tombstones, the crypt, cellar doors, the busts' pedestals, lamp posts, the tea party's table and
chairs, the teeter-totter's stone), the front yard (railings and gate, pillars, gas lamps, flagstones, bushes,
the pet cemetery), the hearse, and the weeping angel and bushes behind the house.

    blender -b --factory-startup -P blender/grounds.py -- --out blender/build --size 1536 --cool-size 1536 --samples 256

Bake exterior.py first: the house comes in from assets/exterior.glb as bake-only scenery (its moon shadow
falls across the front yard), and its lights from exterior_lights.json.

Writes grounds.glb (objects Grd_<group>: trees, graveyard, yard, hearse, and the live-lit iron and hearse-trim
groups), grounds_warm.png, grounds_cool.png (sqrt-encoded irradiance) and grounds.json. Everything that moves
stays procedural: the busts, ghosts, caretaker and dog, the teapot, the teeter-totter's plank, the horse's
harness, the lanterns, the jack-o'-lanterns and the epitaphs (painted at load time). Placements match
js/outside.js; the tables of graves below are shared with it.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
from mathutils import Vector
import kit
import trees
from kit import M, mat, box, cyl, lathe, sphere, slab2d, rod, torus, dome, group, light, blocker, hexcol

A = kit.args({'out': 'assets', 'size': 1536, 'cool_size': 1536, 'samples': 256})
kit.reset_scene(A['samples'])
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
rng = random.Random(1337)

for name, col, rough in [('stone_warm', '#8a7f78', 0.9), ('stone', '#7d7690', 0.9), ('stone_dark', '#4f4a5e', 0.85), ('flags', '#5a5468', 0.8),
                         ('tomb', '#7d7889', 0.9), ('tomb_dark', '#5a5566', 0.9), ('dirt', '#2c2420', 1.0), ('wood_dark', '#3a2214', 0.8),
                         ('iron', '#17131d', 0.5), ('gold', '#c9a24a', 0.4), ('black', '#0d0b10', 0.6), ('plume', '#141018', 0.9),
                         ('walnut', '#2a170d', 0.6), ('mahogany', '#4a1e14', 0.5), ('velvet', '#5e1426', 0.9), ('cloth', '#a99fb8', 0.9),
                         ('void', '#050308', 1.0), ('bark', '#2b2129', 0.9), ('bark_light', '#3d323a', 0.9), ('moss', '#5d6a52', 1.0),
                         ('foliage', '#22302a', 0.9), ('foliage_dark', '#1f2a26', 0.9)]:
    mat(name, col, rough)
IRON = M['iron']

# ------------------------------------------------------------------ helpers (all in three coords)
def blob(c, r, sc, m, subdiv=1, rough=0.25):
    """A lumpy ball: an icosphere pushed in and out by smooth noise, scaled by sc."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    ph = [rng.uniform(0, math.tau) for _ in range(4)]
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + rough * (0.5 * math.sin(2.3 * d.x + ph[0]) * math.sin(1.7 * d.y + ph[1]) + 0.35 * math.sin(3.9 * d.z + ph[2])
                         + 0.25 * math.sin(5.3 * (d.x + d.z) + ph[3]))
        v.co = kit.V(c[0] + d.x * r * sc[0] * k, c[1] + d.y * r * sc[1] * k, c[2] + d.z * r * sc[2] * k)
    return kit.finish(bm, m, 'blob')

def bezier(p0, p1, p2, n=8):
    """n points along a quadratic Bezier curve in 2D, after its start."""
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
            for t in (k / n for k in range(1, n + 1))]

def post_lamp(x, z, h):
    """A cast-iron lamp post whose cup carries one of the site's lanterns at height h."""
    k = h / 2.6
    lathe([(0, 0), (0.2, 0), (0.2, 0.07), (0.16, 0.11), (0.16, 0.3 * k), (0.1, 0.42 * k), (0.07, 0.55 * k), (0.055, h - 0.32), (0.085, h - 0.27),
           (0.06, h - 0.22), (0.06, h - 0.1), (0.12, h - 0.04), (0.12, h), (0, h)], x, 0, z, IRON, seg=8)
    if h > 2:                                      # the lamplighter's ladder bar
        box(x - 0.32, x + 0.32, h - 0.55, h - 0.51, z - 0.02, z + 0.02, IRON)

# ------------------------------------------------------------------ the dead trees (js/outside.js; grown by trees.py)
group('trees')
trees.spiral(M['bark'])
trees.behind_house(M['bark_light'])
trees.gnarled(trees.skeleton(-21.5, 0.0, -5.2, h=15, r=0.7, seed=7, moss=True, spread=1.1), M['bark'], seed=7, moss=M['moss'], detail=0.7)   # the great oak
trees.gnarled(trees.skeleton(-23.0, 0.0, 3.0, h=6.5, r=0.28, seed=3), M['bark_light'], seed=3, detail=0.5)

# ------------------------------------------------------------------ graveyard
# (x, z, turn, kind, epitaph, scale, tilt, dark): kinds 0 rounded, 1 cross, 2 obelisk, 3 gothic; js/outside.js has the same table
GRAVES = [
    (15.8, 4.2, 0.2, 0, 0, 1.05, 0.03, 0), (17.2, 5.4, -0.15, 3, 1, 0.95, -0.04, 1), (16.0, 2.0, 0.1, 1, -1, 1.1, 0.05, 0),
    (18.6, 3.1, 0.25, 2, -1, 1.0, -0.02, 1), (15.6, -5.6, 0.3, 0, 2, 1.12, -0.05, 1), (17.8, -6.4, -0.2, 3, 3, 0.92, 0.04, 0),
    (19.6, -6.0, 0.1, 1, -1, 1.0, -0.03, 1), (25.0, -6.2, 0.0, 3, 4, 1.08, 0.02, 0), (27.2, -6.6, -0.2, 0, 5, 0.97, -0.06, 1),
    (29.6, -6.0, 0.25, 2, -1, 1.15, 0.03, 0), (30.6, -3.6, -0.5, 1, -1, 0.9, 0.05, 1), (20.4, 6.8, 0.4, 0, -1, 1.02, -0.04, 0),
    (30.4, 1.4, -0.4, 3, -1, 0.94, 0.06, 1), (26.4, -3.6, 0.15, 1, -1, 1.06, -0.02, 0),
]
PETS = [(-22.6, 7.1, 0.12, 0, 0, 0.42, -0.03, 0), (-21.35, 8.2, -0.15, 0, 1, 0.42, 0.04, 0), (-20.1, 7.1, 0.05, 0, 2, 0.42, 0.02, 1),
        (-18.85, 8.2, -0.08, 0, 3, 0.42, -0.05, 0), (-19.5, 9.3, 0.3, 1, -1, 0.5, 0.03, 1)]

def tombstone(x, z, ry, kind, face, s, tilt, dark):
    m = M['tomb_dark' if dark else 'tomb']
    with kit.frame((x, 0, z), ry=ry, rz=tilt, s=s):
        if kind == 0:                              # rounded top, tall enough to frame its epitaph
            box(-0.48, 0.48, 0, 0.14, -0.17, 0.17, m, bevel=0.025)
            arc = [(0.4 * math.cos(a), 0.95 + 0.4 * math.sin(a)) for a in (math.pi * k / 12 for k in range(13))]
            slab2d([(-0.4, 0.13), (0.4, 0.13)] + arc, -0.1, 0.1, m, bevel=0.025, segs=1)
        elif kind == 1:                            # a Celtic cross on a stepped base
            box(-0.3, 0.3, 0, 0.12, -0.22, 0.22, m, bevel=0.02)
            box(-0.2, 0.2, 0.12, 0.24, -0.15, 0.15, m, bevel=0.02)
            box(-0.08, 0.08, 0.24, 1.3, -0.08, 0.08, m, bevel=0.015)
            box(-0.36, 0.36, 0.82, 0.98, -0.08, 0.08, m, bevel=0.015)
            with kit.frame((0, 0.9, 0)):
                torus(0.21, 0.035, m, seg=16, ring=5)
        elif kind == 2:                            # obelisk
            box(-0.34, 0.34, 0, 0.12, -0.34, 0.34, m, bevel=0.02)
            box(-0.28, 0.28, 0.12, 0.27, -0.28, 0.28, m, bevel=0.015)
            box(-0.31, 0.31, 0.27, 0.32, -0.31, 0.31, m, bevel=0.015)
            cyl(0.2, 0.1, 1.58, 0, 0.32, 0, m, seg=4, rot=math.pi / 4)
            cyl(0.14, 0.0, 0.25, 0, 1.9, 0, m, seg=4, rot=math.pi / 4)
        else:                                      # slab with a pointed gothic top
            box(-0.44, 0.44, 0, 0.14, -0.16, 0.16, m, bevel=0.025)
            pts = [(-0.34, 0.13), (0.34, 0.13), (0.34, 0.9)] + bezier((0.34, 0.9), (0.3, 1.22), (0, 1.4), 6) + bezier((0, 1.4), (-0.3, 1.22), (-0.34, 0.9), 6)
            slab2d(pts, -0.09, 0.09, m, bevel=0.02, segs=1)
            sphere(0.045, 0, 1.42, 0, m, seg=8)
        dome((0, 0, 0.75), 0.45, 0.09, 0.8, M['dirt'], seg=8, rings=3)

group('graveyard')
for g in GRAVES:
    tombstone(*g)
# the low wall at the back and right, with piers, a coping and railings on top (js/outside.js: 0.55 high)
SW, SD = M['stone_warm'], M['stone_dark']
box(14.6, 31.8, 0, 0.47, -7.8, -7.3, SW, bevel=0.02)
box(31.3, 31.8, 0, 0.47, -7.3, 10.0, SW, bevel=0.02)
box(14.55, 31.85, 0.47, 0.56, -7.86, -7.24, SD, bevel=0.02)
box(31.24, 31.86, 0.47, 0.56, -7.24, 10.05, SD, bevel=0.02)
for x in (14.75, 18.95, 23.15, 27.35):
    box(x - 0.3, x + 0.3, 0, 0.75, -7.9, -7.2, SW, bevel=0.03)
    box(x - 0.36, x + 0.36, 0.75, 0.85, -7.96, -7.14, SD, bevel=0.025)
for z in (-7.55, -3.1, 1.35, 5.8, 9.75):
    box(31.2, 31.9, 0, 0.75, z - 0.3, z + 0.3, SW, bevel=0.03)
    box(31.14, 31.96, 0.75, 0.85, z - 0.36, z + 0.36, SD, bevel=0.025)
# the cellar doors flung open beside the ride's descent, and their sills
for zd, rx in ((7.0, 0.35), (9.4, -0.35)):
    sgn = -1 if rx > 0 else 1
    with kit.frame((18.6, 0.02, zd), rx=rx):
        for i in range(6):
            x0 = -2.6 + i * 5.2 / 6
            box(x0 + 0.012, x0 + 5.2 / 6 - 0.012, 0, 0.1, 0, sgn * 1.15, M['wood_dark'], bevel=0.012)
box(15.4, 21.9, -0.02, 0.12, 6.85, 7.0, SD, bevel=0.02)
box(15.4, 21.9, -0.02, 0.12, 9.4, 9.55, SD, bevel=0.02)
# pedestals for the five singing busts
for i in range(5):
    x, z = 24.3 + i * 1.35, 1.0 + math.sin(i * 1.7) * 0.25
    box(x - 0.32, x + 0.32, 0, 0.12, z - 0.32, z + 0.32, M['tomb'], bevel=0.02)
    lathe([(0, 0.12), (0.25, 0.12), (0.25, 0.17), (0.21, 0.21), (0.18, 0.26), (0.17, 0.84), (0.2, 0.88), (0.23, 0.93), (0, 0.93)], x, 0, z, M['tomb'], seg=14)
    box(x - 0.29, x + 0.29, 0.93, 1.05, z - 0.29, z + 0.29, M['tomb'], bevel=0.02)
# the crypt with the hitchhikers (its plaque stays procedural)
with kit.frame((25.6, 0, 5.0)):
    box(-1.95, 1.95, 0, 0.18, -1.35, 1.42, SW, bevel=0.02)
    box(-1.85, 1.85, 0.18, 0.35, -1.25, 1.3, SW, bevel=0.02)
    for k in range(5):                             # coursed stone
        y0 = 0.35 + k * 0.47
        box(-1.6, 1.6, y0 + 0.008, y0 + 0.462, -1.1, 0.7, M['stone'], bevel=0.025)
    box(-0.6, 0.6, 0.35, 2.0, 0.69, 0.75, M['void'])
    box(-0.78, -0.6, 0.35, 2.0, 0.7, 0.8, SW, bevel=0.015)
    box(0.6, 0.78, 0.35, 2.0, 0.7, 0.8, SW, bevel=0.015)
    box(-0.78, 0.78, 2.0, 2.16, 0.7, 0.8, SW, bevel=0.015)
    box(-0.1, 0.1, 1.9, 2.17, 0.7, 0.84, SW, bevel=0.015)
    for sx in (-1, 1):
        box(sx * 1.45, sx * 1.63, 0.35, 2.7, 0.55, 0.76, SW, bevel=0.02)
        lathe([(0, 0.35), (0.26, 0.35), (0.26, 0.43), (0.22, 0.5), (0.2, 0.55), (0.17, 2.5), (0.2, 2.55), (0.25, 2.62), (0.25, 2.7), (0, 2.7)],
              sx * 1.25, 0, 0.95, M['tomb'], seg=14)
    box(-1.8, 1.8, 2.7, 2.86, -1.25, 1.25, SW, bevel=0.02)
    box(-1.92, 1.92, 2.86, 3.0, -1.35, 1.35, SW, bevel=0.03)
    slab2d([(-1.85, 3.0), (1.85, 3.0), (0, 3.9)], -1.25, 1.25, SW)
    for p0, p1 in (((-1.98, 2.98), (0, 3.98)), ((0, 3.98), (1.98, 2.98))):   # raking cornice
        d = Vector((p1[0] - p0[0], p1[1] - p0[1])).normalized()
        n = Vector((-d.y, d.x)) * 0.13
        slab2d([p0, p1, (p1[0] - n.x, p1[1] - n.y), (p0[0] - n.x, p0[1] - n.y)], 1.18, 1.36, SW)
    with kit.frame((0, 3.33, 1.24), rx=math.pi / 2):
        cyl(0.22, 0.22, 0.06, 0, 0, 0, M['stone'], seg=18)
    for x, y in ((-1.8, 3.0), (1.8, 3.0), (0, 3.92)):
        lathe([(0, 0), (0.1, 0), (0.07, 0.06), (0.13, 0.17), (0.11, 0.27), (0.05, 0.31), (0.05, 0.36), (0, 0.4)], x, y, 1.18, SW, seg=10)
# the tea party's table and chairs (the teapot and the guests stay procedural)
with kit.frame((28.4, 0, -4.3)):
    lathe([(0, 0), (0.28, 0), (0.26, 0.05), (0.1, 0.1), (0.06, 0.2), (0.06, 0.32), (0, 0.32)], 0, 0, 0, M['mahogany'], seg=12)
    sk = lathe([(0, 0.84), (0.6, 0.84), (0.63, 0.78), (0.66, 0.66), (0.69, 0.5), (0.72, 0.32), (0, 0.32)], 0, 0, 0, M['cloth'], seg=36)
    for v in sk.data.vertices:                     # the folds in the cloth
        x, y = v.co.x, v.co.z
        if y < 0.75:
            k = 1 + 0.06 * math.sin(math.atan2(-v.co.y, x) * 9) * ((0.8 - y) / 0.8)
            v.co.x *= k
            v.co.y *= k
    for sx in (-1, 1):
        with kit.frame((sx * 0.95, 0, 0), ry=-sx * math.pi / 2, s=0.85):
            for lx, lz in ((-0.24, -0.22), (0.24, -0.22), (-0.24, 0.22), (0.24, 0.22)):
                lathe([(0, 0), (0.025, 0), (0.035, 0.15), (0.025, 0.3), (0.035, 0.42), (0.03, 0.5), (0, 0.5)], lx, 0, lz, M['mahogany'], seg=8)
            box(-0.29, 0.29, 0.48, 0.58, -0.27, 0.27, M['velvet'], bevel=0.03)
            box(-0.27, 0.27, 0.58, 1.73, -0.29, -0.21, M['mahogany'], bevel=0.02)
            box(-0.21, 0.21, 0.68, 1.63, -0.215, -0.19, M['velvet'], bevel=0.015)
            with kit.frame((0, 1.73, -0.25), rx=math.pi / 2):
                cyl(0.27, 0.27, 0.08, 0, -0.04, 0, M['mahogany'], seg=14)
# the stone the royal teeter-totter rocks on (its plank stays procedural)
with kit.frame((17.4, 0, -4.4), ry=0.2):
    box(-0.45, 0.45, 0, 0.08, -0.32, 0.32, SW, bevel=0.02)
    slab2d([(-0.3, 0.08), (0.3, 0.08), (0.05, 0.6), (-0.05, 0.6)], -0.22, 0.22, SW, bevel=0.02)

# ------------------------------------------------------------------ front yard
group('yard')
for z in (8.95, 9.5, 10.05):                       # flagstones up to the gate
    for x in (-0.6, 0.6):
        pts = [(x - 0.47 + rng.uniform(-0.03, 0.03), z + 0.02), (x + 0.47, z + 0.02 + rng.uniform(0, 0.03)), (x + 0.48 + rng.uniform(-0.03, 0.01), z + 0.25),
               (x + 0.46, z + 0.46 - rng.uniform(0, 0.03)), (x - 0.46 + rng.uniform(0, 0.03), z + 0.46), (x - 0.48, z + 0.24 + rng.uniform(-0.04, 0.04))]
        slab2d(pts, 0.0, 0.06, M['flags'], plane='xz', bevel=0.015)
for x, h in ((-1.6, 2.0), (1.6, 2.0), (15.0, 1.7), (22.9, 1.7)):   # gate pillars carry the lanterns; the others get a ball
    z = 10.2
    box(x - 0.44, x + 0.44, 0, 0.2, z - 0.44, z + 0.44, SD, bevel=0.02)
    box(x - 0.38, x + 0.38, 0.2, h, z - 0.38, z + 0.38, SW, bevel=0.015)
    for nx, nz in ((1, 0), (-1, 0), (0, 1), (0, -1)):                  # raised panels
        if nx:
            box(x + nx * 0.38, x + nx * 0.405, 0.45, h - 0.3, z - 0.26, z + 0.26, SW, bevel=0.008)
        else:
            box(x - 0.26, x + 0.26, 0.45, h - 0.3, z + nz * 0.38, z + nz * 0.405, SW, bevel=0.008)
    box(x - 0.48, x + 0.48, h, h + 0.1, z - 0.48, z + 0.48, SD, bevel=0.02)
    box(x - 0.42, x + 0.42, h + 0.1, h + 0.18, z - 0.42, z + 0.42, SD, bevel=0.02)
    if h < 2:
        lathe([(0, 0), (0.12, 0), (0.08, 0.06), (0.06, 0.1), (0.16, 0.2), (0.2, 0.32), (0.16, 0.46), (0.06, 0.52), (0, 0.53)], x, h + 0.18, z, SW, seg=12)
for x0, x1 in ((-23.7, -1.6), (1.6, 15.0), (22.9, 31.7)):           # a low curb under the front railing
    box(x0, x1, 0, 0.12, 10.1, 10.34, SD, bevel=0.02)
box(-23.82, -23.58, 0, 0.12, 5.6, 10.1, SD, bevel=0.02)
for x in (-12.8, -10.0, -8.4, 8.5, 10.4, 12.9):    # bushes along the foundation
    blob((x, 0.42, 5.6), 0.75, (1.2, 0.75, 0.8), M['foliage'])
    blob((x + rng.uniform(-0.55, -0.35), 0.3, 5.75), 0.45, (1, 0.8, 1), M['foliage'])
    blob((x + rng.uniform(0.35, 0.55), 0.28, 5.7), 0.42, (1, 0.8, 1), M['foliage'])
for g in PETS:                                     # the pet cemetery
    tombstone(*g)
# behind the house: a weeping angel and more bushes
with kit.frame((9.4, 0, -6.6), ry=math.pi * 0.1):
    T_ = M['tomb']
    box(-0.5, 0.5, 0, 0.12, -0.5, 0.5, SW, bevel=0.02)
    box(-0.42, 0.42, 0.12, 0.5, -0.42, 0.42, SW, bevel=0.02)
    box(-0.48, 0.48, 0.5, 0.6, -0.48, 0.48, SW, bevel=0.02)
    robe = lathe([(0, 0.6), (0.42, 0.6), (0.4, 0.8), (0.33, 1.2), (0.26, 1.6), (0.2, 1.95), (0.16, 2.08), (0, 2.12)], 0, 0, 0, T_, seg=24)
    for v in robe.data.vertices:
        k = 1 + 0.07 * math.sin(math.atan2(-v.co.y, v.co.x) * 8) * max(0.0, (1.9 - v.co.z) / 1.3)
        v.co.x *= k
        v.co.y *= k
    sphere(0.15, 0, 2.27, 0.07, T_, seg=12)
    for sx in (-1, 1):                             # arms raised, hands over the face
        rod((sx * 0.17, 2.02, 0.0), (sx * 0.12, 2.0, 0.17), 0.055, T_)
        rod((sx * 0.12, 2.0, 0.17), (sx * 0.05, 2.24, 0.2), 0.05, T_)
        sphere(0.055, sx * 0.05, 2.27, 0.2, T_, seg=8)
        wing = [(0.0, 0.0), (0.2, 0.45), (0.42, 0.85), (0.6, 1.1), (0.72, 0.85), (0.66, 0.78), (0.7, 0.6), (0.62, 0.55), (0.62, 0.38),
                (0.52, 0.34), (0.48, 0.16), (0.36, 0.12), (0.3, -0.02), (0.15, -0.06)]     # leading edge up, feathers down the back
        with kit.frame((sx * 0.1, 1.55, -0.2), ry=-sx * 0.55, rx=-0.25):
            slab2d([(sx * u, v) for u, v in (wing if sx > 0 else list(reversed(wing)))], -0.03, 0.03, T_, bevel=0.012, segs=1)
            covert = [(u * 0.62 + 0.02, v * 0.55 + 0.42) for u, v in wing]
            slab2d([(sx * u, v) for u, v in (covert if sx > 0 else list(reversed(covert)))], 0.03, 0.07, T_, bevel=0.012, segs=1)
for x, z in ((5.6, -6.6), (12.6, -6.9), (-4.0, -6.8), (-9.5, -6.6), (-12.0, -7.0)):
    blob((x, 0.48, z), 0.9, (1.3, 0.75, 0.8), M['foliage_dark'])
    blob((x + 0.6, 0.32, z + 0.1), 0.5, (1, 0.8, 1), M['foliage_dark'])

# ------------------------------------------------------------------ the hearse (its harness and lamps stay procedural)
group('hearse')
B, G_ = M['black'], M['gold']
with kit.frame((-12.0, 0, 8.0)):
    box(-1.6, 1.8, 0.7, 0.85, -0.42, 0.42, B, bevel=0.02)                 # chassis
    box(-1.42, 1.22, 0.85, 1.1, -0.64, 0.64, B, bevel=0.03)               # lower panel
    box(-1.44, 1.24, 1.08, 1.13, -0.655, 0.655, G_, bevel=0.01)           # gilt moulding
    box(-1.4, 1.2, 1.13, 2.45, -0.62, 0.62, B)                            # the glass case (the glass is procedural)
    for sx in (-1.15, -0.1, 0.95):
        for sz in (-1, 1):
            box(sx - 0.06, sx + 0.06, 1.1, 2.3, sz * 0.62, sz * 0.665, G_, bevel=0.012)
    for sz in (-1, 1):
        box(-1.15, 0.95, 1.12, 1.16, sz * 0.62, sz * 0.66, G_)
        box(-1.15, 0.95, 2.24, 2.28, sz * 0.62, sz * 0.66, G_)
        for sx in (-1.42, 1.22):                                           # turned corner posts
            lathe([(0, 0.85), (0.075, 0.85), (0.06, 0.95), (0.045, 1.0), (0.045, 2.3), (0.07, 2.36), (0.075, 2.45), (0, 2.45)], sx, 0, sz * 0.62, B, seg=10)
        with kit.frame((-0.1, 0.97, sz * 0.645), rx=sz * math.pi / 2):   # a gilt medallion on each side
            cyl(0.12, 0.1, 0.03, 0, 0, 0, G_, seg=16)
    box(-1.5, 1.3, 2.45, 2.62, -0.7, 0.7, G_, bevel=0.02)                 # cornice
    box(-1.45, 1.25, 2.62, 2.85, -0.66, 0.66, B, bevel=0.04)              # roof
    box(-1.25, 1.05, 2.85, 2.93, -0.48, 0.48, B, bevel=0.03)
    for sx in (-1.35, 1.15):                                               # urns and black ostrich plumes
        for sz in (-0.58, 0.58):
            lathe([(0, 0), (0.07, 0), (0.05, 0.04), (0.1, 0.1), (0.08, 0.17), (0.04, 0.2), (0, 0.22)], sx, 2.85, sz, G_, seg=10)
            with kit.frame((sx, 3.03, sz), rz=0.18 * (1 if sx > 0 else -1), rx=0.18 * (1 if sz > 0 else -1)):
                lathe([(0, 0), (0.05, 0.04), (0.11, 0.18), (0.13, 0.34), (0.1, 0.5), (0.04, 0.64), (0, 0.7)], 0, 0, 0, M['plume'], seg=10)
    box(1.2, 1.9, 1.5, 1.85, -0.55, 0.55, B, bevel=0.03)                  # driver's box, seat and footboard
    box(1.25, 1.42, 1.85, 2.35, -0.5, 0.5, B, bevel=0.03)
    box(1.42, 1.78, 1.85, 1.95, -0.45, 0.45, M['velvet'], bevel=0.03)
    box(1.85, 2.25, 1.0, 1.05, -0.48, 0.48, B, bevel=0.015)
    for x in (1.9, 2.2):
        rod((x, 1.05, 0), (x - 0.05, 1.5, 0), 0.025, B)
    for wx, r in ((-1.0, 0.72), (1.25, 0.55)):                             # wheels: iron tyre, felloe, spokes, hub
        rod((wx, r, -0.82), (wx, r, 0.82), 0.04, B)
        for sz in (-0.75, 0.75):
            with kit.frame((wx, r, sz)):
                torus(r, 0.05, B, seg=20, ring=5)
                torus(r - 0.07, 0.03, G_, seg=20, ring=4)
                for k in range(10):
                    a = k * math.tau / 10
                    rod((math.cos(a) * 0.08, math.sin(a) * 0.08, 0), (math.cos(a) * (r - 0.08), math.sin(a) * (r - 0.08), 0), 0.02, G_, r1=0.014, seg=6)
                rod((0, 0, -0.08), (0, 0, 0.08), 0.1, G_, seg=12)
    for sz in (-0.42, 0.42):                                               # shafts for the horse that is not there
        rod((1.7, 1.05, sz), (5.1, 0.85, sz), 0.035, M['walnut'], r1=0.028)

# ------------------------------------------------------------------ ironwork, lit live by the site
group('iron', lit=True)
kit.fence(-23.7, 10.22, -1.6, 10.22, 0.12, 1.3, IRON)
kit.fence(1.6, 10.22, 15.0, 10.22, 0.12, 1.3, IRON)
kit.fence(22.9, 10.22, 31.7, 10.22, 0.12, 1.3, IRON)
kit.fence(-23.7, 10.22, -23.7, 5.6, 0.12, 1.3, IRON)
kit.fence(14.8, -7.55, 31.55, -7.55, 0.56, 1.05, IRON)
kit.fence(31.55, -7.55, 31.55, 10.0, 0.56, 1.05, IRON)
for x, ry in ((-1.5, -1.2), (1.5, math.pi + 1.2)):                         # the gates, swung open
    with kit.frame((x, 0.05, 10.2), ry=ry):
        box(0, 0.05, 0, 1.55, -0.025, 0.025, IRON)
        box(1.45, 1.5, 0, 1.5, -0.025, 0.025, IRON)
        for yy in (0.08, 0.72, 1.32):
            box(0, 1.5, yy, yy + 0.04, -0.02, 0.02, IRON)
        for i in range(1, 10):
            u = 1.5 * i / 10
            top = 1.4 + 0.14 * math.sin(math.pi * (1 - u / 1.5) / 2)
            box(u - 0.014, u + 0.014, 0.04, top, -0.014, 0.014, IRON)
            cyl(0.035, 0.0, 0.11, u, top, 0, IRON, seg=4, rot=math.pi / 4)
        with kit.frame((0.75, 1.0, 0)):
            torus(0.2, 0.012, IRON, seg=16, ring=4)
for x, z, h in ((-4.0, 9.4, 2.6), (4.0, 9.4, 2.6), (15.6, 0.6, 1.8), (24.0, -7.2, 1.8)):
    post_lamp(x, z, h)
for zd, rx in ((7.0, 0.35), (9.4, -0.35)):                                 # straps on the cellar doors
    sgn = -1 if rx > 0 else 1
    with kit.frame((18.6, 0.02, zd), rx=rx):
        for x in (-1.8, 0.0, 1.8):
            box(x - 0.08, x + 0.08, 0.1, 0.14, 0.03 * sgn, sgn * 1.12, IRON)
group('hearse-trim', lit=True)
with kit.frame((-12.0, 0, 8.0)):                                           # the gallery round the hearse's roof
    for sz in (-0.5, 0.5):
        box(-1.3, 1.1, 3.06, 3.09, sz - 0.015, sz + 0.015, G_)
        for k in range(11):
            x = -1.3 + 2.4 * k / 10
            box(x - 0.012, x + 0.012, 2.93, 3.06, sz - 0.012, sz + 0.012, G_)
    for sx in (-1.3, 1.1):
        box(sx - 0.015, sx + 0.015, 3.06, 3.09, -0.5, 0.5, G_)
        for k in range(1, 4):
            z = -0.5 + k / 4
            box(sx - 0.012, sx + 0.012, 2.93, 3.06, z - 0.012, z + 0.012, G_)
    for sz in (-0.62, 0.62):                                               # lamp brackets
        box(1.88, 1.95, 1.6, 1.64, sz - 0.02, sz + 0.02, IRON)

# ------------------------------------------------------------------ bake-only scenery: the house and its tower, their insides, the lawn
group('main')
house = kit.scenery(os.path.join(ROOT, 'assets', 'exterior.glb'))
X0, X1, Z0, Z1, AT, SKIN = -14.0, 14.0, -5.0, 5.0, 14.0, 0.16
blocker(box(X0 + SKIN, X1 - SKIN, 0.0, AT, Z0 + SKIN, Z1 - SKIN, M['stone']))
bm = bmesh.new()                                   # the attic: the hull of the mansard's slopes
for ob in house:
    if ob.name.startswith('Ext_mansard'):
        for v in ob.data.vertices:
            bm.verts.new(v.co)
bmesh.ops.convex_hull(bm, input=bm.verts)
me = bpy.data.meshes.new('attic')
bm.to_mesh(me)
bm.free()
attic = bpy.data.objects.new('attic', me)
bpy.context.scene.collection.objects.link(attic)
kit.OBJS.append(attic)
attic.data.materials.append(M['stone'])
blocker(attic)
blocker(box(-60, 80, -0.6, 0.0, -30, 30, mat('lawn', '#26302a', 0.95)), keep_material=True)

# ------------------------------------------------------------------ lights: the house's, plus the graveyard's own
SKY = kit.load_lights(os.path.join(HERE, 'exterior_lights.json'))
world = kit.sky(*SKY)
light('crypt_glow', 'POINT', (25.6, 1.6, 7.2), hexcol('#5dffa0'), 795, size=0.3)      # js/outside.js's three graveyard lights
light('bust_light', 'POINT', (27.0, 3.2, 3.4), hexcol('#8fb8ff'), 640, size=0.3)
light('caretaker', 'POINT', (21.14, 1.2, 5.32), hexcol('#ffb060'), 485, size=0.15)
for x, z in ((15.6, 0.6), (24.0, -7.2)):                                               # green lanterns on the lamp posts
    light('green_lamp', 'POINT', (x, 1.98, z), hexcol('#5dffa0'), 15, size=0.1)
for sz in (-0.62, 0.62):                                                               # the hearse's lamps
    light('hearse_lamp', 'POINT', (-12.0 + 1.95, 1.92, 8.0 + sz), hexcol('#5dffa0'), 8, size=0.08)
for x, y, z in ((19.2, 0, 7.6), (23.2, 0, 3.0), (29.6, 0, 7.4), (16.4, 0, -2.2), (22.8, 0, -6.6),
                (-1.9, 0.53, 8.2), (2.0, 0.26, 8.55), (-2.6, 0, 9.3), (6.6, 0.8, 7.2)):  # jack-o'-lanterns
    light('pumpkin', 'POINT', (x, y + 0.3, z), hexcol('#ff8a2a'), 4, size=0.1)

kit.build('grounds', 'Grd', A['out'], A['size'], A['cool_size'], A['samples'], cool_world=world,
          hidden=lambda n, c: n[1] < -0.9 and c[1] < 0.02)
