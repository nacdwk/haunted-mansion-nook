"""Build, light-bake and export the Conservatory: the ground floor's right-hand room, where a coffin lies in state
among dead plants, behind a wall of glass.

    blender -b --factory-startup -P blender/conservatory.py -- --out blender/build --size 2048 --samples 256

Writes conserv.glb (Con_main: the floor, ceiling, the partition's dressing and the furniture, which stay put; Con_back:
the dressing round the glass wall, its planting shelf and the vines, which melt with the back facade; Con_right: the
side wall's dressing and its window's drapes, which melt with the right facade), conserv_warm.png and
conserv_cool.png (sqrt-encoded irradiance) and conserv.json.

warm: the room's green glow and the candles on their stands.
cool: moonlight through the glass wall (barred by its iron grid) and the windows, and a little ambient light.

The coffin stays procedural, with its lid, the hands under it and the green light inside (js/baked.js lights the
baked surfaces with that light live), and so do the raven, the glass and its iron grid, the windows' panes, the front
wall and every flame. Coordinates match js/house.js and js/rooms.js.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
from mathutils import Vector
import kit
from kit import M, V, mat, box, cyl, lathe, sphere, prism, slab2d, rod, torus, Wall, subtract, runs_at, group, light, blocker, empty

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 1536, 'samples': 256})
kit.reset_scene(A['samples'])

F1 = 0.8
XL, XR, ZB, ZF = 4.87, 13.6, -4.6, 4.6           # the room's wall faces: partition, right facade, back and front
CEIL = 6.97
for name, col, rough in [('wallpaper', '#26362f', 0.85), ('wainscot', '#4a3524', 0.6), ('walnut', '#2a170d', 0.55), ('gilt', '#c9a24a', 0.4),
                         ('plaster', '#b9ad9e', 0.8), ('ceiling', '#a99d90', 0.85), ('checker', '#3e5248', 0.4), ('marble_dark', '#2e2834', 0.3),
                         ('velvet', '#4b2563', 0.95), ('curtain', '#2c4a3a', 0.95), ('iron', '#17131d', 0.5), ('brass', '#a8844e', 0.4),
                         ('wax', '#efe6cf', 0.6), ('terracotta', '#8a4a32', 0.85), ('soil', '#2a1a12', 1.0), ('dead_leaf', '#5a4a2e', 0.9),
                         ('stem', '#3a2e26', 0.9), ('flower', '#4a1a2a', 0.8), ('ribbon', '#3a1f45', 0.6), ('wicker', '#5a4630', 0.9),
                         ('stone', '#7a7480', 0.85)]:
    mat(name, col, rough)
WARM = (1.0, 0.65, 0.32)                          # Blender watts like the Grand Hall's lights (js/baked.js assumes them)
GHOST = (0.205, 1.0, 0.479)                       # the room's green glow (js/rooms.js: 0x7dffb8)
MOON = (0.55, 0.62, 1.0)
rng = random.Random(13)

def flame(x, y, z, s=1.0, power=21.0):
    """A candle flame: drawn by the site (an empty it finds by name) and a warm light for the bake."""
    empty(f'Flame_{len(kit.LIGHTS)}', x, y, z, flameScale=s)
    light('candle', 'POINT', (x, y + 0.03, z), WARM, power, size=0.04)

# ------------------------------------------------------------------ walls: base, panelled wainscot, chair rail, damask, cornice
WH = 1.6                                          # the conservatory's wainscot is lower than the hall's (js/house.js)
CORNICE = [(0, 6.55), (0.03, 6.55), (0.05, 6.58), (0.05, 6.635), (0.09, 6.66), (0.1, 6.72), (0.16, 6.76), (0.2, 6.82), (0.22, 6.88),
           (0.27, 6.91), (0.28, CEIL), (0, CEIL)]
def dress(w, holes):
    L = w.length
    for a, b in runs_at(L, holes, F1 + 0.1):
        w.box(a, b, F1, F1 + 0.24, 0, 0.035, M['walnut'])
        w.mold(a, b, [(0, F1 + 0.24), (0.045, F1 + 0.24), (0.05, F1 + 0.26), (0.03, F1 + 0.28), (0, F1 + 0.28)], M['walnut'])
    for r in subtract(0, L, F1 + 0.28, F1 + WH - 0.12, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.018, M['wainscot'])
    for a, b in runs_at(L, holes, F1 + 0.8):
        n = max(1, round((b - a) / 0.9))
        pw = (b - a - (n + 1) * 0.12) / n
        if pw > 0.15:
            for i in range(n):
                u0 = a + 0.12 + i * (pw + 0.12)
                w.box(u0, u0 + pw, F1 + 0.4, F1 + WH - 0.24, 0.018, 0.036, M['wainscot'], bevel=0.012)
    for a, b in runs_at(L, holes, F1 + WH - 0.05):
        w.mold(a, b, [(0, F1 + WH - 0.12), (0.035, F1 + WH - 0.12), (0.05, F1 + WH - 0.09), (0.062, F1 + WH - 0.05), (0.05, F1 + WH - 0.01),
                      (0.03, F1 + WH + 0.02), (0, F1 + WH + 0.02)], M['walnut'])
    for r in subtract(0, L, F1 + WH + 0.02, 6.2, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.012, M['wallpaper'])
    w.box(0, L, 6.2, 6.26, 0, 0.035, M['walnut'])
    w.box(0, L, 6.26, 6.55, 0, 0.012, M['plaster'])
    w.mold(0, L, CORNICE, M['plaster'])
    w.mold(0, L, [(0.05, 6.632), (0.078, 6.632), (0.078, 6.662), (0.05, 6.662)], M['gilt'])

def casing(w, u0, u1, v0, v1, width=0.16):
    """A moulded architrave round an opening, with a raised centre."""
    for a, b, c, d in ((u0 - width, u0, v0, v1 + width), (u1, u1 + width, v0, v1 + width), (u0 - width, u1 + width, v1, v1 + width)):
        w.box(a, b, c, d, 0, 0.045, M['walnut'])
    for a, b, c, d in ((u0 - width + 0.04, u0 - 0.04, v0, v1 + width - 0.04), (u1 + 0.04, u1 + width - 0.04, v0, v1 + width - 0.04),
                       (u0 - width + 0.04, u1 + width - 0.04, v1 + 0.04, v1 + width - 0.04)):
        w.box(a, b, c, d, 0.045, 0.06, M['walnut'])

def dead_plant(x, y, z, s, n=5, tall=False):
    """Dead stems from (x, y, z), bending over, with withered leaves hanging from them."""
    for i in range(n):
        a = math.tau * i / n + rng.uniform(-0.4, 0.4)
        h = (rng.uniform(1.4, 2.2) if tall else rng.uniform(0.45, 0.9)) * s
        lean = rng.uniform(0.15, 0.35)
        p = Vector((x + math.cos(a) * 0.05 * s, y, z + math.sin(a) * 0.05 * s))
        d = Vector((math.cos(a) * lean, 1.0, math.sin(a) * lean)).normalized()
        segs = 4
        for k in range(segs):
            q = p + d * (h / segs)
            rod(tuple(p), tuple(q), 0.014 * s * (1.2 - 0.2 * k), M['stem'], seg=5)
            for side in (-1, 1):                          # leaves drooping from each joint
                if rng.random() < (0.9 if tall else 0.7):
                    la = a + side * rng.uniform(0.6, 1.4)
                    ln = (0.32 if tall else 0.16) * s * rng.uniform(0.7, 1.1)
                    tip = q + Vector((math.cos(la) * ln * 0.6, -ln * rng.uniform(0.5, 0.9), math.sin(la) * ln * 0.6))
                    rod(tuple(q), tuple(tip), 0.035 * s * (1.3 if tall else 1.0), M['dead_leaf'], r1=0.0, seg=4)
            p = q
            d = (d + Vector((math.cos(a) * 0.35, -0.12 * k, math.sin(a) * 0.35))).normalized()   # bending over

def urn(x, z, s=1.0, tall=False):
    """A terracotta urn of dead plants."""
    prof = [(0, 0), (0.18, 0), (0.2, 0.04), (0.15, 0.08), (0.19, 0.12), (0.26, 0.34), (0.3, 0.41), (0.31, 0.46), (0.27, 0.47), (0.25, 0.44), (0, 0.44)]
    lathe([(r * s, h * s) for r, h in prof], x, F1, z, M['terracotta'], seg=16)
    cyl(0.25 * s, 0.25 * s, 0.01, x, F1 + 0.42 * s, z, M['soil'], seg=14)
    dead_plant(x, F1 + 0.43 * s, z, s, n=3 if tall else 5, tall=tall)

# ------------------------------------------------------------------ the back wall: the glass wall's casing, a planting shelf, vines
BACK = Wall((XL, 0, ZB), (1, 0, 0), (0, 0, 1), XR - XL)
LEFT = Wall((XL, 0, ZB), (0, 0, 1), (1, 0, 0), ZF - ZB)
RIGHT = Wall((XR, 0, ZB), (0, 0, 1), (-1, 0, 0), ZF - ZB)
GLASS = (5.4, 13.0, 1.4, 6.6)                     # the glass wall's opening (js/house.js), x and y
WIN = (-1.7, -0.3, 2.0, 5.8)                      # the side window, z and y
TRACK_L = (2.25 - ZB, ZF - ZB, F1, 4.75)          # the ride comes in through the partition...
TRACK_R = (2.4 - ZB, ZF - ZB, F1, 4.4)            # ...and leaves through the side wall
group('back')
gu = (GLASS[0] - XL, GLASS[1] - XL)
dress(BACK, [(gu[0], gu[1], F1, GLASS[3])])
casing(BACK, gu[0], gu[1], GLASS[2] + 0.12, GLASS[3])
box(GLASS[0] - 0.2, GLASS[1] + 0.2, GLASS[2], GLASS[2] + 0.12, ZB - 0.02, ZB + 0.36, M['stone'], bevel=0.015)   # the planting shelf
BACK.mold(gu[0] - 0.2, gu[1] + 0.2, [(0.36, GLASS[2] - 0.12), (0.39, GLASS[2] - 0.08), (0.39, GLASS[2]), (0, GLASS[2]), (0, GLASS[2] - 0.12)], M['stone'])
for x0 in (5.6, 8.4, 11.2):                        # planters on the shelf, their dead plants, and vines up the glass
    box(x0, x0 + 1.6, GLASS[2] + 0.12, GLASS[2] + 0.36, ZB + 0.06, ZB + 0.32, M['walnut'], bevel=0.01)
    box(x0 + 0.04, x0 + 1.56, GLASS[2] + 0.36, GLASS[2] + 0.37, ZB + 0.1, ZB + 0.28, M['soil'])
    for k in range(3):
        dead_plant(x0 + 0.3 + k * 0.5, GLASS[2] + 0.37, ZB + 0.19, 0.7)
    vx = x0 + 0.8
    pts = [Vector((vx, GLASS[2] + 0.37, ZB + 0.12))]
    for k in range(9):
        p = pts[-1]
        pts.append(Vector((min(max(p.x + rng.uniform(-0.45, 0.45), GLASS[0] + 0.1), GLASS[1] - 0.1), p.y + rng.uniform(0.4, 0.62), ZB + 0.06 + 0.03 * math.sin(k))))
    for p0, p1 in zip(pts, pts[1:]):
        rod(tuple(p0), tuple(p1), 0.022, M['stem'], seg=5)
        for side in (-1, 1):
            tip = p1 + Vector((side * rng.uniform(0.1, 0.2), -rng.uniform(0.08, 0.2), 0.05))
            rod(tuple(p1), tuple(tip), 0.05, M['dead_leaf'], r1=0.0, seg=4)

# ------------------------------------------------------------------ the side wall: its window, with drapes
group('right')
wu = (WIN[0] - ZB, WIN[1] - ZB)
dress(RIGHT, [TRACK_R, (wu[0], wu[1], WIN[2], WIN[3])])
casing(RIGHT, wu[0], wu[1], WIN[2], WIN[3])
for a, b, c, d in ((TRACK_R[0] - 0.16, TRACK_R[0], F1, TRACK_R[3] + 0.16), (TRACK_R[0] - 0.16, TRACK_R[1], TRACK_R[3], TRACK_R[3] + 0.16)):
    RIGHT.box(a, b, c, d, 0, 0.05, M['walnut'])     # the ride's way out: a casing up to the front wall
RIGHT.box(wu[0] - 0.24, wu[1] + 0.24, WIN[2] - 0.14, WIN[2], 0, 0.2, M['walnut'], bevel=0.01)          # sill
for zc, flip in ((WIN[0] - 0.2, -1), (WIN[1] + 0.2, 1)):                      # drapes, falling in folds to the floor
    pts = []
    for k in range(17):
        t = k / 16
        zz = zc - 0.38 + 0.76 * t
        pts.append((XR - 0.1 - 0.05 * (0.5 + 0.5 * math.sin(t * math.tau * 3)), zz))
    pts += [(XR - 0.02, zc + 0.38), (XR - 0.02, zc - 0.38)]
    slab2d(pts, F1 + 0.04, 6.25, M['curtain'], plane='xz')
pel = [(XR - 0.24 - 0.03 * math.sin(k / 12 * math.tau * 2), WIN[0] - 0.75 + (WIN[1] - WIN[0] + 1.5) * k / 12) for k in range(13)] + [(XR - 0.02, WIN[1] + 0.75), (XR - 0.02, WIN[0] - 0.75)]
slab2d(pel, 5.95, 6.4, M['curtain'], plane='xz')                             # the pelmet
rod((XR - 0.27, 6.42, WIN[0] - 0.8), (XR - 0.27, 6.42, WIN[1] + 0.8), 0.025, M['gilt'], seg=8)
for zc in (WIN[0] - 0.2, WIN[1] + 0.2):                                       # tie-back tassels
    sphere(0.04, XR - 0.2, 3.3, zc, M['gilt'], seg=8)
    cyl(0.03, 0.0, 0.14, XR - 0.2, 3.12, zc, M['gilt'], seg=8)

# ------------------------------------------------------------------ the partition (stays put)
group('main')
dress(LEFT, [TRACK_L])

# ------------------------------------------------------------------ floor: green checker in a dark marble border; ceiling
box(XL, XR, 0.42, F1 - 0.004, ZB, ZF, M['marble_dark'])
box(XL + 0.4, XR - 0.4, F1 - 0.004, F1, ZB + 0.4, ZF - 0.4, M['checker'])
for x0, x1, z0, z1 in ((XL + 0.36, XR - 0.36, ZB + 0.36, ZB + 0.4), (XL + 0.36, XR - 0.36, ZF - 0.4, ZF - 0.36), (XL + 0.36, XL + 0.4, ZB + 0.36, ZF - 0.36),
                       (XR - 0.4, XR - 0.36, ZB + 0.36, ZF - 0.36)):
    box(x0, x1, F1 - 0.004, F1 + 0.001, z0, z1, M['brass'])
box(XL, XR, CEIL, 7.0, ZB, ZF, M['ceiling'])
for x0, x1, z0, z1 in ((XL + 0.55, XR - 0.55, ZB + 0.55, ZB + 0.67), (XL + 0.55, XR - 0.55, ZF - 0.67, ZF - 0.55), (XL + 0.55, XL + 0.67, ZB + 0.55, ZF - 0.55),
                       (XR - 0.67, XR - 0.55, ZB + 0.55, ZF - 0.55)):
    box(x0, x1, CEIL - 0.05, CEIL, z0, z1, M['plaster'], bevel=0.015)

# ------------------------------------------------------------------ the bier: a stepped catafalque under a velvet pall (the coffin sits on it)
BX, BZ = 8.6, -1.1
box(BX - 1.68, BX + 1.68, F1, F1 + 0.08, BZ - 0.88, BZ + 0.88, M['marble_dark'], bevel=0.01)
box(BX - 1.52, BX + 1.52, F1 + 0.08, F1 + 0.16, BZ - 0.72, BZ + 0.72, M['marble_dark'], bevel=0.01)
box(BX - 1.37, BX + 1.37, F1 + 0.79, F1 + 0.85, BZ - 0.57, BZ + 0.57, M['velvet'], bevel=0.02)
outline = []
for k in range(64):                                # the pall's skirt, folded all round
    t = k / 64
    per = 2 * (2.76 + 1.16)
    d = t * per
    if d < 2.76:
        x, z, nx, nz = BX - 1.38 + d, BZ - 0.58, 0, -1
    elif d < 2.76 + 1.16:
        x, z, nx, nz = BX + 1.38, BZ - 0.58 + (d - 2.76), 1, 0
    elif d < 2 * 2.76 + 1.16:
        x, z, nx, nz = BX + 1.38 - (d - 2.76 - 1.16), BZ + 0.58, 0, 1
    else:
        x, z, nx, nz = BX - 1.38, BZ + 0.58 - (d - 2 * 2.76 - 1.16), -1, 0
    f = 0.035 * math.sin(d * 14)
    outline.append((x + nx * f, z + nz * f))
slab2d(outline, F1 + 0.16, F1 + 0.8, M['velvet'], plane='xz')
for y0, y1 in ((F1 + 0.72, F1 + 0.8), (F1 + 0.16, F1 + 0.21)):        # gold fringe at the top and the hem
    box(BX - 1.42, BX + 1.42, y0, y1, BZ - 0.62, BZ + 0.62, M['gilt'])
for sx in (-1, 1):
    for sz in (-1, 1):                              # tassels at the corners
        rod((BX + sx * 1.4, F1 + 0.72, BZ + sz * 0.6), (BX + sx * 1.4, F1 + 0.5, BZ + sz * 0.6), 0.04, M['gilt'], r1=0.012, seg=8)
        sphere(0.035, BX + sx * 1.4, F1 + 0.75, BZ + sz * 0.6, M['gilt'], seg=8)

# ------------------------------------------------------------------ candle stands either side of the bier
for cx in (6.8, 10.4):
    for i in range(3):
        a = math.tau * i / 3 + 0.5
        rod((cx + math.cos(a) * 0.24, F1, BZ + math.sin(a) * 0.24), (cx, F1 + 0.2, BZ), 0.022, M['iron'], seg=6)
        sphere(0.035, cx + math.cos(a) * 0.24, F1 + 0.02, BZ + math.sin(a) * 0.24, M['iron'], seg=6)
    lathe([(0, 0.15), (0.07, 0.15), (0.09, 0.21), (0.045, 0.3), (0.035, 1.25), (0.065, 1.33), (0.03, 1.42), (0.045, 1.52), (0.14, 1.58), (0.15, 1.63), (0, 1.63)],
          cx, F1, BZ, M['iron'], seg=14)
    cyl(0.07, 0.068, 0.5, cx, F1 + 1.63, BZ, M['wax'], seg=12)
    for k in range(4):                              # wax drips
        a = math.tau * k / 4 + 0.3
        rod((cx + math.cos(a) * 0.068, F1 + 2.1, BZ + math.sin(a) * 0.068), (cx + math.cos(a) * 0.072, F1 + 1.95 - 0.05 * k, BZ + math.sin(a) * 0.072), 0.014, M['wax'], r1=0.008, seg=5)
    flame(cx, F1 + 2.17, BZ)

# ------------------------------------------------------------------ funeral wreaths on easels
for wx, wz in ((6.0, -3.4), (11.3, -3.4)):
    for sx in (-1, 1):
        rod((wx + sx * 0.32, F1, wz + 0.22), (wx + sx * 0.12, F1 + 1.95, wz + 0.04), 0.022, M['walnut'], seg=6)
    rod((wx, F1, wz - 0.42), (wx, F1 + 1.9, wz + 0.02), 0.02, M['walnut'], seg=6)
    box(wx - 0.36, wx + 0.36, F1 + 0.98, F1 + 1.03, wz + 0.05, wz + 0.22, M['walnut'])
    cy, cz, R = F1 + 1.46, wz + 0.16, 0.42
    for i in range(44):                             # dead leaves round the ring
        a = math.tau * i / 44 + rng.uniform(-0.05, 0.05)
        c = Vector((wx + math.cos(a) * R, cy + math.sin(a) * R, cz))
        off = rng.uniform(-0.09, 0.09)
        base = c + Vector((math.cos(a) * off, math.sin(a) * off, rng.uniform(-0.03, 0.05)))
        tang = Vector((-math.sin(a), math.cos(a), rng.uniform(-0.3, 0.3))).normalized()
        rod(tuple(base), tuple(base + tang * 0.18 + Vector((0, 0, 0.04))), 0.055, M['dead_leaf'], r1=0.0, seg=4)
    for i in range(11):                             # withered roses
        a = math.tau * i / 11 + 0.2
        sphere(0.055, wx + math.cos(a) * R, cy + math.sin(a) * R, cz + 0.07, M['flower'], seg=7)
    prism([(wx - 0.36, cy - 0.12, cz + 0.12), (wx + 0.3, cy + 0.26, cz + 0.12), (wx + 0.36, cy + 0.17, cz + 0.12), (wx - 0.3, cy - 0.21, cz + 0.12)],
          (0, 0, 0.012), M['ribbon'])               # a sash across it, and its tails
    for sx in (-1, 1):
        prism([(wx + sx * 0.04, cy - 0.3, cz + 0.1), (wx + sx * 0.12, cy - 0.3, cz + 0.1), (wx + sx * 0.22, cy - 0.78, cz + 0.1), (wx + sx * 0.13, cy - 0.72, cz + 0.1)],
              (0, 0, 0.01), M['ribbon'])

# ------------------------------------------------------------------ urns of dead plants, and the raven's plant stand
for x, z, s, tall in ((5.7, -3.9, 1.1, False), (7.6, -4.0, 0.9, False), (9.9, -4.0, 1.0, False), (12.7, -3.7, 1.4, True), (13.0, -1.2, 1.0, False), (5.5, 1.2, 0.85, False)):
    urn(x, z, s, tall)
RX, RZ = 11.6, 0.6
for i in range(3):                                  # scrolled tripod feet
    a = math.tau * i / 3
    p0 = (RX + math.cos(a) * 0.3, F1, RZ + math.sin(a) * 0.3)
    rod(p0, (RX + math.cos(a) * 0.2, F1 + 0.18, RZ + math.sin(a) * 0.2), 0.02, M['iron'], seg=6)
    rod((RX + math.cos(a) * 0.2, F1 + 0.18, RZ + math.sin(a) * 0.2), (RX + math.cos(a) * 0.05, F1 + 0.42, RZ + math.sin(a) * 0.05), 0.02, M['iron'], seg=6)
    sphere(0.04, *p0, M['iron'], seg=6)
lathe([(0, 0.4), (0.06, 0.4), (0.04, 0.5), (0.03, 1.43), (0.06, 1.51), (0.04, 1.59), (0, 1.59)], RX, F1, RZ, M['iron'], seg=10)
cyl(0.3, 0.3, 0.06, RX, F1 + 1.59, RZ, M['iron'], seg=20)          # the raven perches on it (js/rooms.js)

# ------------------------------------------------------------------ hanging baskets of dead ferns
for hx, hz in ((6.6, -2.7), (10.6, -2.7)):
    for i in range(3):
        a = math.tau * i / 3
        rod((hx, CEIL, hz), (hx + math.cos(a) * 0.22, 5.45, hz + math.sin(a) * 0.22), 0.006, M['iron'], seg=4)
    lathe([(0, 5.2), (0.12, 5.21), (0.22, 5.3), (0.25, 5.45), (0.23, 5.46), (0, 5.4)], hx, 0, hz, M['wicker'], seg=14)
    for i in range(9):                              # fronds hanging over the rim
        a = math.tau * i / 9 + rng.uniform(-0.2, 0.2)
        p0 = (hx + math.cos(a) * 0.18, 5.46, hz + math.sin(a) * 0.18)
        p1 = (hx + math.cos(a) * 0.42, 5.3, hz + math.sin(a) * 0.42)
        p2 = (hx + math.cos(a) * 0.5, 4.75 - rng.uniform(0, 0.3), hz + math.sin(a) * 0.5)
        rod(p0, p1, 0.035, M['dead_leaf'], r1=0.03, seg=4)
        rod(p1, p2, 0.03, M['dead_leaf'], r1=0.0, seg=4)

# ------------------------------------------------------------------ bake-only: the walls' cores, the glass wall's grid, the coffin
for r in subtract(XL, XR, F1, CEIL, [(GLASS[0], GLASS[1], GLASS[2], GLASS[3])]):
    blocker(box(r[0], r[1], r[2], r[3], ZB - 0.4, ZB, M['walnut']))
for k in range(9):                                  # the glass wall's iron grid (js/house.js), so the moonlight is barred
    x = GLASS[1] - k * (GLASS[1] - GLASS[0]) / 8
    blocker(box(x - 0.05, x + 0.05, GLASS[2], GLASS[3], ZB - 0.3, ZB - 0.1, M['iron']))
for y in (GLASS[2], 3.4, 5.1, GLASS[3]):
    blocker(box(GLASS[0], GLASS[1], y - 0.05, y + 0.05, ZB - 0.3, ZB - 0.1, M['iron']))
FRONT_WINS = [(7.2 - 0.78, 7.2 + 0.78, 2.0, 5.8), (11.5 - 0.78, 11.5 + 0.78, 2.0, 5.8)]
for r in subtract(XL, XR, F1, CEIL, FRONT_WINS):
    blocker(box(r[0], r[1], r[2], r[3], ZF, ZF + 0.4, M['walnut']))
for r in subtract(ZB, ZF, F1, CEIL, [(WIN[0], WIN[1], WIN[2], WIN[3]), (2.4, ZF, F1, 4.4)]):
    blocker(box(XR, XR + 0.4, r[2], r[3], r[0], r[1], M['walnut']))
for r in subtract(ZB, ZF, F1, CEIL, [(2.25, ZF, F1, 4.75)]):
    blocker(box(XL - 0.4, XL, r[2], r[3], r[0], r[1], M['walnut']))
blocker(box(BX - 1.2, BX + 1.2, F1 + 0.85, F1 + 1.42, BZ - 0.4, BZ + 0.4, M['walnut']))   # the coffin (the site draws it)

# ------------------------------------------------------------------ lights
light('ghost_glow', 'POINT', (9.0, 5.0, 0.4), GHOST, 320, size=0.8)      # js/rooms.js's green light
light('moon_glass', 'AREA', ((GLASS[0] + GLASS[1]) / 2, (GLASS[2] + GLASS[3]) / 2, ZB - 0.45), MOON, 700,
      size=(GLASS[1] - GLASS[0]) * 0.95, size_y=(GLASS[3] - GLASS[2]) * 0.95, aim=(0.1, -0.45, 1), group='cool')
light('moon_side', 'AREA', (XR + 0.3, (WIN[2] + WIN[3]) / 2, (WIN[0] + WIN[1]) / 2), MOON, 120, size=(WIN[1] - WIN[0]) * 0.9, size_y=(WIN[3] - WIN[2]) * 0.9,
      aim=(-1, -0.3, 0), group='cool')
for x0, x1, v0, v1 in FRONT_WINS:
    light('moon_front', 'AREA', ((x0 + x1) / 2, (v0 + v1) / 2, ZF + 0.1), MOON, 90, size=(x1 - x0) * 0.9, size_y=(v1 - v0) * 0.9, aim=(0, -0.25, -1), group='cool')

kit.build('conserv', 'Con', A['out'], A['size'], A['cool_size'], A['samples'],
          ambient=lambda nrm, ao: ao * np.array([0.07, 0.08, 0.1], np.float32),     # the house's dim, cool ambient
          hidden=lambda n, c: c[2] > ZF - 0.01 and n[2] > 0.5 and c[1] < F1)        # the floor's cut edge, under the house's trim
