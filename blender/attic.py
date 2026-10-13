"""Build, light-bake and export the Attic: the long room under the mansard where the bride waits with a candle,
among trunks, hat boxes and a grand piano that plays itself.

    blender -b --factory-startup -P blender/attic.py -- --out blender/build --size 2048 --samples 256

Writes attic.glb (Att_main: the floor and everything standing on it, which stays put; Att_slope-front, -back, -left
and -right: each slope's plank lining, rafters, purlins and hips, which melt with that slope of the mansard),
attic_warm.png and attic_cool.png (sqrt-encoded irradiance) and attic.json.

warm: the bride's pale glow and the candles on their stands. cool: the night through the ride's opening in the right
slope, and a little ambient light.
The bride with the candelabra, the ghosts in the trunks, the pianist, the rocking chair, the wedding portraits and the
cobwebs stay procedural (js/rooms.js), and so do the dormers, which belong to the exterior. Nothing is put in the
Doom Buggies' way: up through the slot in the floor, round, and along z = 2.3 to the opening in the right slope.
Coordinates match js/house.js (buildMansard) and js/rooms.js.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
from mathutils import Vector
import kit
from kit import M, mat, box, cyl, lathe, sphere, prism, slab2d, rod, torus, loft, subtract, free_runs, group, light, blocker, empty

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 1024, 'samples': 256})
kit.reset_scene(A['samples'])

AT, TOP = 14.0, 19.4
B, BZ, TX, TZ = 14.25, 5.25, 12.3, 3.3             # the mansard's foot and top (js/house.js buildMansard)
K = (B - TX) / (TOP - AT)                          # how far a slope leans in per unit of height
SLOT = (-13.4, -9.0, -4.6, -2.0)                   # where the ride climbs through the floor (x0, x1, z0, z1)
for name, col, rough in [('floor', '#5b3720', 0.7), ('lining', '#3a2214', 0.8), ('beam', '#2e1c12', 0.85), ('piano', '#0d0b10', 0.25),
                         ('ivory', '#f2ecde', 0.4), ('brass', '#a8844e', 0.4), ('gilt', '#c9a24a', 0.4), ('walnut', '#2a170d', 0.55),
                         ('velvet', '#5e1426', 0.95), ('trunk_a', '#4a2a1a', 0.7), ('trunk_b', '#3a2a3a', 0.7), ('trunk_c', '#2a3a3a', 0.7),
                         ('slat', '#6a4a2a', 0.8), ('hatbox_a', '#7a4a5a', 0.8), ('hatbox_b', '#4a5a7a', 0.8), ('hatbox_c', '#8a7a4a', 0.8),
                         ('ribbon', '#d8cfc0', 0.6), ('canvas', '#b9b0a2', 0.95), ('dress', '#d9cfd6', 0.85), ('form', '#8a7a6a', 0.85),
                         ('sash', '#7a2a3a', 0.8), ('wax', '#efe6cf', 0.6), ('mirror', '#4a5070', 0.08), ('rug', '#1d2a4a', 0.95)]:
    mat(name, col, rough)
WARM = (1.0, 0.65, 0.32)
BRIDE = (0.39, 0.58, 1.0)                          # js/rooms.js: 0xa8c8ff
NIGHT = (0.55, 0.62, 1.0)
rng = random.Random(41)

def flame(x, y, z, s=1.0, power=21.0):
    empty(f'Flame_{len(kit.LIGHTS)}', x, y, z, flameScale=s)
    light('candle', 'POINT', (x, y + 0.03, z), WARM, power, size=0.03)

# ------------------------------------------------------------------ the slopes: plank lining, rafters, purlins, hips
# Each slope as js/house.js has it, outer face foot first. The lining fills 0.13 to 0.22 inside it, where the
# house's own inner skin was; the right slope is in three pieces round the ride's way out (z 1.0 to 3.6, up to t 0.52).
def rpt(t, z):
    return (B - (B - TX) * t, AT + (TOP - AT) * t, z)
RZA, RZB, RTO = 1.0, 3.6, 0.52
TOP_O = AT + (TOP - AT) * RTO                       # the top of the ride's opening
SLOPES = {
    'front': [[(-B, AT, BZ), (B, AT, BZ), (TX, TOP, TZ), (-TX, TOP, TZ)]],
    'back': [[(B, AT, -BZ), (-B, AT, -BZ), (-TX, TOP, -TZ), (TX, TOP, -TZ)]],
    'left': [[(-B, AT, -BZ), (-B, AT, BZ), (-TX, TOP, TZ), (-TX, TOP, -TZ)]],
    'right': [[rpt(0, RZA), rpt(0, -BZ), rpt(1, -TZ), rpt(1, RZA)],
              [rpt(RTO, RZA), rpt(1, RZA), rpt(1, TZ), rpt(RTO, BZ - (BZ - TZ) * RTO)],
              [rpt(0, RZB), rpt(0, BZ), rpt(RTO, BZ - (BZ - TZ) * RTO), rpt(RTO, RZB)]],
}
SIGN = {'front': 1, 'back': -1, 'left': -1, 'right': 1}
def inward(q):
    a, b, c = Vector(q[0]), Vector(q[1]), Vector(q[2])
    n = (b - a).cross(c - a).normalized()
    mid = sum((Vector(p) for p in q), Vector()) / len(q)
    return n if n.dot(Vector((0, 16.5, 0)) - mid) > 0 else -n
INNER = 0.22
HOFF = INNER * math.hypot(1, K)                     # the inner face's distance in from the outer, across the floor
along_x = lambda side: side in ('front', 'back')

def face_at(side, u, y):
    """The point on a slope's inner face at height y and u along it (x on the front and back, z on the sides), and
    the way up the slope per unit of height."""
    s = SIGN[side]
    e = (BZ if along_x(side) else B) - K * (y - AT) - HOFF
    if along_x(side):
        return Vector((u, y, s * e)), Vector((0, 1, -s * K))
    return Vector((s * e, y, u)), Vector((-s * K, 1, 0))

def reach(side, y, margin=0.25):
    """How far along a slope its inner face goes at height y, short of the hips."""
    return (B if along_x(side) else BZ) - K * (y - AT) - HOFF - margin

def rafter(side, u, y0, y1, w=0.1, d=0.17):
    """A beam up the slope from y0 to y1, lying on the lining at u along it."""
    p, up = face_at(side, u, y0)
    s = SIGN[side]
    if along_x(side):
        a, b, out = Vector((-w / 2, 0, 0)), Vector((w / 2, 0, 0)), Vector((0, 0, -s * d))
    else:
        a, b, out = Vector((0, 0, -w / 2)), Vector((0, 0, w / 2)), Vector((-s * d, 0, 0))
    prism([tuple(p + a - out * 0.15), tuple(p + b - out * 0.15), tuple(p + b + out), tuple(p + a + out)], tuple(up * (y1 - y0)), M['beam'])

def purlin(side, y, runs, h=0.16, d=0.16):
    """A beam along the slope at height y, over the runs [(u0, u1)]."""
    p, _ = face_at(side, 0, y)
    s = SIGN[side]
    for u0, u1 in runs:
        if along_x(side):
            box(u0, u1, y - h / 2, y + h / 2, p.z + s * 0.03, p.z - s * d, M['beam'])
        else:
            box(p.x + s * 0.03, p.x - s * d, y - h / 2, y + h / 2, u0, u1, M['beam'])

def hip(sx, sz, w=0.15):
    """The beam in the corner where two slopes meet, nestled against both linings."""
    y0, y1 = AT + 0.02, TOP - 0.2
    c = Vector((face_at('right' if sx > 0 else 'left', 0, y0)[0].x, y0, face_at('front' if sz > 0 else 'back', 0, y0)[0].z))
    pts = [c, c + Vector((-sx * w, 0, 0)), c + Vector((-sx * w, 0, -sz * w)), c + Vector((0, 0, -sz * w))]
    prism([tuple(p) for p in pts], (-sx * K * (y1 - y0), y1 - y0, -sz * K * (y1 - y0)), M['beam'])

DORMERS = [-8.0, 0.0, 8.0]                          # they poke through the front slope up to y 18.3
PORTRAITS = [-7.4, -4.9, 3.8, 6.3]                  # on the back slope, y 15.5 to 17.3 (js/rooms.js)
RAFT_TOP = TOP - 0.2                                # the roof deck's underside
for side in ('front', 'back', 'left', 'right'):
    group('slope-' + side)
    for q in SLOPES[side]:
        n = inward(q)
        prism([tuple(Vector(p) + n * 0.13) for p in q], tuple(n * (INNER - 0.13)), M['lining'])
group('slope-front')
for x in np.arange(-11.2, 11.3, 1.4):
    if all(abs(x - d) > 1.55 for d in DORMERS):
        rafter('front', x, AT + 0.01, RAFT_TOP)
for y in (15.7, 17.6):
    purlin('front', y, free_runs(-reach('front', y), reach('front', y), [(d - 1.45, d + 1.45) for d in DORMERS]))
purlin('front', 18.9, [(-reach('front', 18.9), reach('front', 18.9))])
for sx in (-1, 1):
    hip(sx, 1)
group('slope-back')
for x in np.arange(-11.2, 11.3, 1.4):
    if all(abs(x - p) > 0.85 for p in PORTRAITS):
        rafter('back', x, AT + 0.01, RAFT_TOP)
for y in (15.1, 17.6, 18.9):                        # clear of the portraits
    purlin('back', y, [(-reach('back', y), reach('back', y))])
for sx in (-1, 1):
    hip(sx, -1)
group('slope-left')
for z in (-2.4, -1.2, 0.0, 1.2, 2.4):
    rafter('left', z, AT + 0.01, RAFT_TOP)
for y in (15.7, 17.6, 18.9):
    purlin('left', y, [(-reach('left', y), reach('left', y))])
group('slope-right')
for z in (-2.4, -1.2, 0.0):
    rafter('right', z, AT + 0.01, RAFT_TOP)
for z in (1.2, 2.4):                                # over the ride's way out
    rafter('right', z, TOP_O + 0.08, RAFT_TOP)
for z in (RZA, RZB):                                # its jambs, over the lining's cut edges, and its header
    rafter('right', z, AT + 0.01, TOP_O + 0.12, w=0.14)
purlin('right', TOP_O + 0.02, [(RZA - 0.07, RZB + 0.07)], h=0.2)
purlin('right', 15.7, free_runs(-reach('right', 15.7), reach('right', 15.7), [(RZA, RZB)]))
for y in (17.6, 18.9):
    purlin('right', y, [(-reach('right', y), reach('right', y))])

# ------------------------------------------------------------------ the floor: boards round the slot the ride climbs through
group('main')
for r in subtract(-13.6, 13.6, -4.6, 4.6, [SLOT]):
    box(r[0], r[1], 13.92, AT, r[2], r[3], M['floor'])
box(SLOT[0] - 0.08, SLOT[1] + 0.08, 13.92, AT + 0.02, SLOT[3], SLOT[3] + 0.08, M['walnut'])     # the slot's trim
box(SLOT[1], SLOT[1] + 0.08, 13.92, AT + 0.02, SLOT[2], SLOT[3], M['walnut'])
box(1.0 - 1.6, 1.0 + 1.6, AT, AT + 0.012, -0.8 - 1.2, -0.8 + 1.2, M['rug'])

# ------------------------------------------------------------------ the grand piano (the pianist and the playing stay the site's)
# js/rooms.js's outline, keyboard at -z toward the pianist and the tail toward +z (the site's own piano had it the
# other way round, its tail through the pianist)
def bezier(a, b, c, d, n):
    return [tuple((1 - t) ** 3 * a[i] + 3 * (1 - t) ** 2 * t * b[i] + 3 * (1 - t) * t * t * c[i] + t ** 3 * d[i] for i in (0, 1))
            for t in (k / n for k in range(1, n + 1))]
OUTLINE = [(-0.8, -0.7), (0.8, -0.7), (0.8, 0.3)] + bezier((0.8, 0.3), (0.8, 1.6), (-0.2, 1.4), (-0.4, 0.8), 12) + [(-0.8, 0.7)]
LID = 0.2                                           # the lid on its short stick, low enough to see the room over
with kit.frame((-6.6, AT, 0.1), ry=0.35):
    slab2d(OUTLINE, 0.62, 1.07, M['piano'], plane='xz', bevel=0.015)
    slab2d([(x * 0.88, 0.35 + (z - 0.35) * 0.88) for x, z in OUTLINE], 1.07, 1.08, M['gilt'], plane='xz')   # the iron frame
    with kit.frame((0.8, 1.07, 0), rz=-LID):       # the lid, hinged on the long straight side
        slab2d([(x - 0.8, z) for x, z in OUTLINE], 0.0, 0.03, M['piano'], plane='xz')
    xl = (0.8 + 0.35) / math.cos(LID)              # the stick holding it up
    rod((-0.35, 1.07, 0.35), (-0.35, 1.07 + xl * math.sin(LID) - 0.01, 0.35), 0.012, M['walnut'], seg=6)
    for lx, lz in ((-0.6, -0.55), (0.6, -0.55), (0.2, 0.9)):
        lathe([(0, 0), (0.05, 0), (0.06, 0.04), (0.04, 0.08), (0.045, 0.3), (0.06, 0.45), (0.05, 0.55), (0.065, 0.62), (0, 0.62)], lx, 0, lz, M['piano'], seg=10)
        cyl(0.065, 0.065, 0.035, lx, 0, lz, M['brass'], seg=10)
    box(-0.8, 0.8, 0.8, 0.88, -0.9, -0.68, M['piano'])                           # the key bed
    box(-0.76, 0.76, 0.88, 0.91, -0.89, -0.72, M['ivory'])
    for sx in (-1, 1):                                                          # cheek blocks
        box(sx * 0.76, sx * 0.8, 0.88, 0.97, -0.9, -0.68, M['piano'])
    wk = 1.52 / 36
    for k in range(35):                             # black keys in their twos and threes
        if k % 7 in (2, 6):
            continue
        x = -0.76 + (k + 1) * wk
        box(x - 0.011, x + 0.011, 0.91, 0.935, -0.82, -0.73, M['piano'])
    box(-0.8, 0.8, 0.88, 1.0, -0.72, -0.66, M['piano'])                          # the fallboard
    slab2d([(-0.3, 1.07), (0.3, 1.07), (0.28, 1.36), (-0.28, 1.36)], -0.62, -0.6, M['piano'], plane='xy')   # the music desk
    box(-0.12, 0.12, 0.06, 0.62, -0.42, -0.36, M['piano'])                       # the pedal lyre
    for px in (-0.06, 0.0, 0.06):
        box(px - 0.012, px + 0.012, 0.06, 0.08, -0.5, -0.36, M['brass'])
with kit.frame((-6.85, AT, -1.0), ry=0.35):       # the bench the shadow sits on
    box(-0.42, 0.42, 0.45, 0.54, -0.2, 0.2, M['velvet'], bevel=0.03)
    box(-0.44, 0.44, 0.38, 0.45, -0.22, 0.22, M['piano'])
    for lx in (-0.36, 0.36):
        for lz in (-0.15, 0.15):
            lathe([(0, 0), (0.035, 0), (0.03, 0.15), (0.04, 0.3), (0.03, 0.38), (0, 0.38)], lx, 0, lz, M['piano'], seg=8)

# ------------------------------------------------------------------ steamer trunks (the ghosts pop out of them)
DOME = [(0.38 * math.cos(math.pi * k / 10), 0.5 + 0.13 * math.sin(math.pi * k / 10)) for k in range(11)]
for (x, z, r), mname in zip(((6.8, -2.6, 0.3), (8.9, -1.2, -0.4), (10.6, -2.9, 0.15)), ('trunk_a', 'trunk_b', 'trunk_c')):
    with kit.frame((x, AT, z), ry=r):
        box(-0.6, 0.6, 0, 0.5, -0.38, 0.38, M[mname], bevel=0.015)
        slab2d(DOME, -0.6, 0.6, M[mname], plane='zy')                           # the domed lid
        for sx in (-0.45, -0.15, 0.15, 0.45):       # wooden slats over the leather
            slab2d([(zz * 1.04, 0.5 + (yy - 0.5) * 1.08) for zz, yy in DOME], sx - 0.035, sx + 0.035, M['slat'], plane='zy')
            box(sx - 0.035, sx + 0.035, 0.0, 0.5, -0.395, 0.395, M['slat'])
        for cx in (-0.6, 0.6):
            for cz in (-0.38, 0.38):
                sphere(0.045, cx, 0.03, cz, M['brass'], seg=6)
                sphere(0.045, cx, 0.48, cz, M['brass'], seg=6)
        box(-0.07, 0.07, 0.36, 0.48, 0.38, 0.41, M['brass'])                      # the lock
        for sx in (-1, 1):                          # leather handles
            box(sx * 0.6, sx * 0.63, 0.3, 0.34, -0.12, 0.12, M['walnut'])

# ------------------------------------------------------------------ hat boxes, stacked
for (x, z, n), base in (((-2.6, -3.6, 3), 0), ((9.8, 1.0, 2), 1), ((-10.2, 0.2, 2), 2)):
    y = AT
    for k in range(n):
        r = 0.32 - k * 0.045
        m = M[('hatbox_a', 'hatbox_b', 'hatbox_c')[(base + k) % 3]]
        xx, zz = x + rng.uniform(-0.05, 0.05), z + rng.uniform(-0.05, 0.05)
        cyl(r, r, 0.25, xx, y, zz, m, seg=20)
        cyl(r + 0.012, r + 0.012, 0.06, xx, y + 0.24, zz, m, seg=20)                 # its lid
        cyl(r + 0.004, r + 0.004, 0.04, xx, y + 0.1, zz, M['ribbon'], seg=20)
        y += 0.31

# ------------------------------------------------------------------ the dress form, in a wedding gown
with kit.frame((4.6, AT, -3.2)):
    lathe([(0.0, 1.05), (0.26, 1.07), (0.2, 1.35), (0.28, 1.67), (0.24, 1.83), (0.08, 1.91), (0.07, 2.0), (0, 2.01)], 0, 0, 0, M['form'], seg=18)
    sphere(0.05, 0, 2.05, 0, M['walnut'], seg=8)
    def ring(y, r, folds):                        # round the skirt at height y, gathered into nine folds
        return [(math.cos(a) * r * (1 + folds * math.sin(a * 9)), y, math.sin(a) * r * (1 + folds * math.sin(a * 9)))
                for a in (math.tau * k / 54 for k in range(54))]
    loft([ring(y, r, f) for y, r, f in ((0.0, 0.66, 0.07), (0.07, 0.66, 0.07), (0.22, 0.6, 0.065), (0.42, 0.52, 0.055), (0.62, 0.44, 0.04),
                                        (0.82, 0.36, 0.025), (0.98, 0.31, 0.01), (1.06, 0.285, 0.0), (1.12, 0.25, 0.0))], M['dress'])
    lathe([(0.0, 1.05), (0.29, 1.06), (0.225, 1.35), (0.3, 1.67), (0.27, 1.8), (0, 1.8)], 0, 0, 0, M['dress'], seg=18)   # the bodice
    cyl(0.24, 0.24, 0.07, 0, 1.33, 0, M['sash'], seg=18)

# ------------------------------------------------------------------ the birdcage on its stand
with kit.frame((-1.4, AT, -3.7)):
    for i in range(3):
        a = math.tau * i / 3
        rod((math.cos(a) * 0.28, 0, math.sin(a) * 0.28), (0, 0.22, 0), 0.018, M['brass'], seg=6)
    rod((0, 0.2, 0), (0, 1.5, 0), 0.025, M['brass'], seg=8)
    cyl(0.27, 0.27, 0.04, 0, 1.5, 0, M['brass'], seg=20)
    for k in range(14):
        a = math.tau * k / 14
        rod((math.cos(a) * 0.25, 1.53, math.sin(a) * 0.25), (math.cos(a) * 0.25, 2.1, math.sin(a) * 0.25), 0.008, M['brass'], seg=4)
    for y in (1.78, 2.08):
        with kit.frame((0, y, 0), rx=math.pi / 2):
            torus(0.25, 0.01, M['brass'], seg=20, ring=4)
    lathe([(0, 0), (0.255, 0), (0.22, 0.12), (0.12, 0.22), (0.03, 0.27), (0, 0.27)], 0, 2.1, 0, M['brass'], seg=16)
    sphere(0.04, 0, 2.4, 0, M['brass'], seg=8)
    with kit.frame((0, 2.48, 0)):
        torus(0.045, 0.009, M['brass'], seg=10, ring=4)

# ------------------------------------------------------------------ candles on the floor
def candelabra(x, z, arms, s):
    tips = [(0, 1.05)] if arms == 1 else [(-0.3, 0.96), (0.0, 1.05), (0.3, 0.96)]
    with kit.frame((x, AT, z), s=s):
        for i in range(3):
            a = math.tau * i / 3
            rod((math.cos(a) * 0.22, 0, math.sin(a) * 0.22), (0, 0.16, 0), 0.02, M['brass'], seg=6)
        lathe([(0, 0.14), (0.06, 0.14), (0.04, 0.24), (0.025, 0.95), (0.05, 1.0), (0.03, 1.05), (0, 1.05)], 0, 0, 0, M['brass'], seg=12)
        if arms > 1:
            for tx, ty in (tips[0], tips[2]):
                rod((0, 0.88, 0), (tx * 0.6, 0.84, 0), 0.016, M['brass'], seg=6)
                rod((tx * 0.6, 0.84, 0), (tx, ty, 0), 0.016, M['brass'], seg=6)
        for tx, ty in tips:
            cyl(0.035, 0.06, 0.04, tx, ty - 0.02, 0, M['brass'], seg=10)
            cyl(0.03, 0.028, 0.24, tx, ty + 0.02, 0, M['wax'], seg=8)
    for tx, ty in tips:
        flame(x + tx * s, AT + (ty + 0.27) * s, z, s)
candelabra(-1.0, -2.8, 3, 0.9)
candelabra(3.2, 0.4, 1, 1.2)

# ------------------------------------------------------------------ a cheval mirror, and furniture under dust sheets
with kit.frame((11.6, AT, -1.0), ry=-1.1):
    for sx in (-1, 1):
        for sz in (-1, 1):
            rod((sx * 0.62, 0, sz * 0.24), (sx * 0.62, 1.1, 0), 0.03, M['walnut'], seg=8)
        rod((sx * 0.62, 1.1, 0), (sx * 0.62, 1.32, 0), 0.03, M['walnut'], seg=8)
        sphere(0.045, sx * 0.62, 1.34, 0, M['walnut'], seg=8)
    with kit.frame((0, 1.02, 0), rx=-0.15):
        for u0, u1, v0, v1 in ((-0.58, -0.48, -0.95, 0.95), (0.48, 0.58, -0.95, 0.95), (-0.58, 0.58, -0.95, -0.85), (-0.58, 0.58, 0.85, 0.95)):
            box(u0, u1, v0, v1, -0.04, 0.04, M['gilt'], bevel=0.01)
        box(-0.48, 0.48, -0.85, 0.85, -0.03, -0.005, M['walnut'])
        box(-0.48, 0.48, -0.85, 0.85, -0.005, 0.02, M['mirror'])
for (x, z, r, w, d, h) in ((-4.4, -3.55, 0.2, 1.0, 0.9, 1.0), (12.4, -3.3, -0.1, 0.8, 0.6, 1.8), (11.7, 3.8, 0.4, 0.9, 0.7, 0.75)):
    with kit.frame((x, AT, z), ry=r):                # a sheet thrown over something, falling in folds to the floor
        def ring(y, k, folds):
            return [(math.cos(a) * w * 0.56 * k * (1 + folds * math.sin(a * 11)), y, math.sin(a) * d * 0.56 * k * (1 + folds * math.sin(a * 11)))
                    for a in (math.tau * i / 44 for i in range(44))]
        loft([ring(h * f, k, folds) for f, k, folds in ((0.0, 1.05, 0.06), (0.25, 1.0, 0.05), (0.6, 0.97, 0.035), (0.84, 0.93, 0.02),
                                                         (0.95, 0.82, 0.01), (1.0, 0.6, 0.0))], M['canvas'])

# ------------------------------------------------------------------ bake-only: the mansard round it, the roof, the dormers poking in
for side, quads in SLOPES.items():
    for q in quads:
        blocker(prism([tuple(p) for p in q], tuple(inward(q) * 0.13), M['lining']))
blocker(box(-12.45, 12.45, TOP - 0.2, TOP + 0.3, -3.45, 3.45, M['lining']))
for d in DORMERS:
    blocker(box(d - 1.15, d + 1.15, 14.6, 17.1, 2.05, 4.25, M['lining']))
    blocker(slab2d([(d - 1.45, 17.1), (d + 1.45, 17.1), (d, 18.3)], 2.05, 4.55, M['lining'], plane='xy'))
blocker(box(-14.2, 14.2, 13.4, 13.92, -5.1, 5.1, M['lining']))                # the slab under the boards
for x0, x1, z0, z1 in ((-14.05, 14.05, -5.06, -4.55), (-14.05, 14.05, 4.55, 5.06), (-14.06, -13.55, -5.0, 5.0), (13.55, 14.06, -5.0, 5.0)):
    blocker(box(x0, x1, 13.98, 14.07, z0, z1, M['lining']))                  # the sill plates (the site's)

# ------------------------------------------------------------------ lights
light('bride_glow', 'POINT', (1.0, AT + 2.9, -0.4), BRIDE, 900, size=0.5)   # js/rooms.js's light round the bride
light('night_out', 'AREA', (14.35, AT + 1.4, 2.3), NIGHT, 120, size=2.4, size_y=2.6, aim=(-1, -0.25, 0), group='cool')

def hidden(n, c):
    """Faces no one sees that the buried-face test can miss where they meet a blocker's edge: the undersides of the
    floor and rug, the floor's cut edges under the house's trim, and the backs of the linings against the slopes."""
    if n[1] < -0.9 and c[1] < AT + 0.02:
        return True
    if (n[2] > 0.9 and c[2] > 4.59 or n[0] > 0.9 and c[0] > 13.59) and c[1] < AT:
        return True
    for quads in SLOPES.values():
        out = -inward(quads[0])
        if Vector(n).dot(out) > 0.99 and -0.15 < (Vector(c) - Vector(quads[0][0])).dot(out) < -0.11:
            return True
    return False

kit.build('attic', 'Att', A['out'], A['size'], A['cool_size'], A['samples'], hidden=hidden,
          ambient=lambda nrm, ao: ao * np.array([0.08, 0.07, 0.12], np.float32))     # the house's dim, cool ambient
