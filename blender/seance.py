"""Build, light-bake and export the Séance Circle: the first floor's right-hand room, where Madame Leota calls the
spirits from her crystal ball.

    blender -b --factory-startup -P blender/seance.py -- --out blender/build --size 2048 --samples 256

Writes seance.glb (Sea_main: the floor, the zodiac ceiling, the partition's drapes and the cabinet of curiosities,
which stay put; Sea_back and Sea_right: the dressing of the back and side walls and their windows, which melt with
those facades), seance_warm.png and seance_cool.png (sqrt-encoded irradiance) and seance.json.

warm: the green candles in the sconces. cool: moonlight through the windows, and a little ambient light.
The crystal ball's light moves with it, so it isn't baked: js/baked.js adds it live, as the site lights the rest of
the room with it. Everything that moves stays procedural (the table and its candles, the ball, the chairs, the
instruments, the raven), and so do the portrait, the front wall and every flame. Coordinates match js/house.js and
js/rooms.js.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
from mathutils import Vector
import kit
from kit import M, V, mat, box, cyl, lathe, sphere, prism, slab2d, rod, Wall, subtract, runs_at, group, light, blocker, empty

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 1536, 'samples': 256})
kit.reset_scene(A['samples'])

F2 = 7.4
XL, XR, ZB, ZF = 4.87, 13.6, -4.6, 4.6            # the room's wall faces: partition, right facade, back and front
CEIL = 13.57                                      # just under the attic's slab
for name, col, rough in [('wallpaper', '#2e1f45', 0.85), ('wainscot', '#4a3524', 0.6), ('walnut', '#2a170d', 0.55), ('gilt', '#c9a24a', 0.4),
                         ('plaster', '#b9ad9e', 0.8), ('zodiac', '#2a2850', 0.85), ('parquet', '#3a2214', 0.5), ('marble_dark', '#2e2834', 0.3),
                         ('rug', '#3a1a4a', 0.95), ('curtain', '#3a1f4a', 0.95), ('brass', '#a8844e', 0.4), ('wax', '#efe6cf', 0.6),
                         ('glass', '#141822', 0.1), ('bone', '#e9e3cf', 0.6), ('void', '#050308', 1.0),
                         ('bottle_green', '#6dffb0', 0.3), ('bottle_violet', '#c070ff', 0.3), ('bottle_orange', '#ff6a3a', 0.3), ('bottle_blue', '#5ad8ff', 0.3)]:
    mat(name, col, rough)
GREEN = (0.15, 1.0, 0.43)                         # MAT.flameGreen; Blender watts like the Grand Hall's lights
MOON = (0.55, 0.62, 1.0)
rng = random.Random(29)

# ------------------------------------------------------------------ walls: base, panelled wainscot, chair rail, damask, cornice
WH = 1.8
PR = CEIL - 0.77                                  # the picture rail
CORNICE = [(0, CEIL - 0.42), (0.03, CEIL - 0.42), (0.05, CEIL - 0.39), (0.05, CEIL - 0.335), (0.09, CEIL - 0.31), (0.1, CEIL - 0.25), (0.16, CEIL - 0.21),
           (0.2, CEIL - 0.15), (0.22, CEIL - 0.09), (0.27, CEIL - 0.06), (0.28, CEIL), (0, CEIL)]
def dress(w, holes):
    L = w.length
    for a, b in runs_at(L, holes, F2 + 0.1):
        w.box(a, b, F2, F2 + 0.26, 0, 0.035, M['walnut'])
        w.mold(a, b, [(0, F2 + 0.26), (0.045, F2 + 0.26), (0.05, F2 + 0.28), (0.03, F2 + 0.3), (0, F2 + 0.3)], M['walnut'])
    for r in subtract(0, L, F2 + 0.3, F2 + WH - 0.12, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.018, M['wainscot'])
    for a, b in runs_at(L, holes, F2 + 0.9):
        n = max(1, round((b - a) / 0.9))
        pw = (b - a - (n + 1) * 0.12) / n
        if pw > 0.15:
            for i in range(n):
                u0 = a + 0.12 + i * (pw + 0.12)
                w.box(u0, u0 + pw, F2 + 0.42, F2 + WH - 0.24, 0.018, 0.036, M['wainscot'], bevel=0.012)
    for a, b in runs_at(L, holes, F2 + WH - 0.05):
        w.mold(a, b, [(0, F2 + WH - 0.12), (0.035, F2 + WH - 0.12), (0.05, F2 + WH - 0.09), (0.062, F2 + WH - 0.05), (0.05, F2 + WH - 0.01),
                      (0.03, F2 + WH + 0.02), (0, F2 + WH + 0.02)], M['walnut'])
    for r in subtract(0, L, F2 + WH + 0.02, PR, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.012, M['wallpaper'])
    w.box(0, L, PR, PR + 0.06, 0, 0.035, M['walnut'])
    w.box(0, L, PR + 0.06, CEIL - 0.42, 0, 0.012, M['plaster'])
    w.mold(0, L, CORNICE, M['plaster'])
    w.mold(0, L, [(0.05, CEIL - 0.338), (0.078, CEIL - 0.338), (0.078, CEIL - 0.308), (0.05, CEIL - 0.308)], M['gilt'])

def casing(w, u0, u1, v0, v1, width=0.16):
    for a, b, c, d in ((u0 - width, u0, v0 - 0.12, v1 + width), (u1, u1 + width, v0 - 0.12, v1 + width), (u0 - width, u1 + width, v1, v1 + width)):
        w.box(a, b, c, d, 0, 0.045, M['walnut'])
    w.box(u0 - width - 0.06, u1 + width + 0.06, v0 - 0.12, v0, 0, 0.16, M['walnut'], bevel=0.01)       # sill

def drape(w, u0, u1, v0, v1, folds=4, depth=0.07):
    """Velvet hanging in folds against a wall, from u0 to u1 and v0 to v1."""
    pts = []
    for k in range(25):
        t = k / 24
        pts.append((u0 + (u1 - u0) * t, 0.02 + depth * (0.5 + 0.5 * math.sin(t * math.tau * folds))))
    pts += [(u1, 0.005), (u0, 0.005)]
    P3 = [w.p(u, v0, d) for u, d in pts]
    prism(P3, (0, v1 - v0, 0), M['curtain'])

def window_drapes(w, u0, u1, v0, v1):
    """A casing, drapes either side, and a pelmet with a gilt rod, all kept under the cornice."""
    top = min(v1 + 0.95, CEIL - 0.44)
    casing(w, u0, u1, v0, v1)
    drape(w, u0 - 0.7, u0 + 0.1, F2 + 0.05, top - 0.4, folds=3, depth=0.1)
    drape(w, u1 - 0.1, u1 + 0.7, F2 + 0.05, top - 0.4, folds=3, depth=0.1)
    drape(w, u0 - 0.8, u1 + 0.8, top - 0.45, top, folds=6, depth=0.14)
    rod(w.p(u0 - 0.85, top + 0.03, 0.2), w.p(u1 + 0.85, top + 0.03, 0.2), 0.025, M['gilt'], seg=8)

def sconce(w, u, v):
    """A brass sconce with a green-flamed candle (the site draws the flame)."""
    rod(w.p(u, v, 0.0), w.p(u, v, 0.02), 0.085, M['brass'], seg=14)
    pts = [w.p(u, v, 0.02), w.p(u, v - 0.07, 0.1), w.p(u, v - 0.05, 0.2), w.p(u, v + 0.02, 0.27), w.p(u, v + 0.07, 0.29)]
    for p0, p1 in zip(pts, pts[1:]):
        rod(p0, p1, 0.016, M['brass'], seg=6)
    x, y, z = w.p(u, v + 0.07, 0.29)
    lathe([(0, 0), (0.075, 0.0), (0.08, 0.02), (0.03, 0.03), (0.024, 0.07), (0, 0.07)], x, y, z, M['brass'], seg=14)
    cyl(0.024, 0.022, 0.2, x, y + 0.07, z, M['wax'], seg=10)
    empty(f'Flame_{len(kit.LIGHTS)}', x, y + 0.31, z, flameScale=1.0, flameGreen=1)
    light('candle', 'POINT', (x, y + 0.33, z), GREEN, 21, size=0.03)

BACK = Wall((XL, 0, ZB), (1, 0, 0), (0, 0, 1), XR - XL)
LEFT = Wall((XL, 0, ZB), (0, 0, 1), (1, 0, 0), ZF - ZB)
RIGHT = Wall((XR, 0, ZB), (0, 0, 1), (-1, 0, 0), ZF - ZB)
BWIN = (8.5, 10.1, 9.4, 11.8)                     # the back window: x and y
RWIN = (0.8, 2.2, 8.6, 12.4)                      # the side window: z and y
TRACK_R = (0.0, -2.25 - ZB, F2, 11.0)             # the ride comes in through the side wall...
DOOR_L = (0.0, -2.15 - ZB, F2, 11.35)             # ...and leaves for the Grand Hall through the partition (with its gilt casing)

# ------------------------------------------------------------------ the back wall: its window, and two sconces
group('back')
bu = (BWIN[0] - XL, BWIN[1] - XL)
dress(BACK, [(bu[0], bu[1], BWIN[2], BWIN[3])])
window_drapes(BACK, bu[0], bu[1], BWIN[2], BWIN[3])
for x in (7.0, 11.6):
    sconce(BACK, x - XL, 11.0)

# ------------------------------------------------------------------ the side wall: the ride's way in, and a window
group('right')
ru = (RWIN[0] - ZB, RWIN[1] - ZB)
dress(RIGHT, [TRACK_R, (ru[0], ru[1], RWIN[2], RWIN[3])])
window_drapes(RIGHT, ru[0], ru[1], RWIN[2], RWIN[3])
for a, b, c, d in ((TRACK_R[1], TRACK_R[1] + 0.16, F2, TRACK_R[3] + 0.16), (TRACK_R[0], TRACK_R[1] + 0.16, TRACK_R[3], TRACK_R[3] + 0.16)):
    RIGHT.box(a, b, c, d, 0, 0.05, M['walnut'])

# ------------------------------------------------------------------ the partition: drapes framing the portrait over a cabinet of curiosities
group('main')
dress(LEFT, [DOOR_L])
PU = 1.3 - ZB                                     # the portrait (js/rooms.js) hangs here; the site still draws it
drape(LEFT, PU - 1.85, PU - 0.85, F2 + 0.02, CEIL - 0.55, folds=4, depth=0.1)
drape(LEFT, PU + 0.85, PU + 1.85, F2 + 0.02, CEIL - 0.55, folds=4, depth=0.1)
swag = []
for k in range(33):                               # a swagged valance across them, with a gilt fringe
    t = k / 32
    swag.append((PU - 2.0 + 4.0 * t, CEIL - 0.73 - 0.22 * abs(math.sin(t * math.pi * 3))))
val = [LEFT.p(u, v, 0.18) for u, v in swag] + [LEFT.p(PU + 2.0, CEIL - 0.45, 0.18), LEFT.p(PU - 2.0, CEIL - 0.45, 0.18)]
prism(val, (-0.16, 0, 0), M['curtain'])
for (u0, v0), (u1, v1) in zip(swag, swag[1:]):
    rod(LEFT.p(u0, v0 - 0.02, 0.19), LEFT.p(u1, v1 - 0.02, 0.19), 0.02, M['gilt'], seg=5)
# the cabinet: plinth, glazed doors, curios on its shelves, a carved cornice, and bottles that glow on top
CU0, CU1, CTOP = PU - 0.85, PU + 0.85, F2 + 2.0
LEFT.box(CU0, CU1, F2, F2 + 0.14, 0, 0.58, M['walnut'], bevel=0.01)
LEFT.box(CU0 + 0.04, CU1 - 0.04, F2 + 0.14, CTOP - 0.16, 0, 0.04, M['walnut'])                       # hollow, its doors open frames
for u0, u1 in ((CU0 + 0.04, CU0 + 0.08), (CU1 - 0.08, CU1 - 0.04)):
    LEFT.box(u0, u1, F2 + 0.14, CTOP - 0.16, 0, 0.52, M['walnut'])
for u in (CU0 + 0.06, (CU0 + CU1) / 2 - 0.02, CU1 - 0.1):                 # door stiles and a rail
    LEFT.box(u, u + 0.04, F2 + 0.16, CTOP - 0.18, 0.52, 0.56, M['walnut'])
for v in (F2 + 0.16, F2 + 1.0, CTOP - 0.22):
    LEFT.box(CU0 + 0.06, CU1 - 0.06, v, v + 0.04, 0.52, 0.56, M['walnut'])
for sh in (F2 + 0.6, F2 + 1.15):
    LEFT.box(CU0 + 0.06, CU1 - 0.06, sh, sh + 0.025, 0.02, 0.5, M['walnut'])
LEFT.box(CU0 - 0.04, CU1 + 0.04, CTOP - 0.16, CTOP - 0.06, 0, 0.6, M['walnut'], bevel=0.01)
LEFT.mold(CU0 - 0.08, CU1 + 0.08, [(0, CTOP - 0.06), (0.62, CTOP - 0.06), (0.66, CTOP - 0.03), (0.66, CTOP), (0, CTOP)], M['walnut'])
for sh in (F2 + 0.625, F2 + 1.175):           # curios behind the glass: a skull, jars, a little bell jar
    x, y, z = LEFT.p(CU0 + 0.35, sh, 0.25)
    sphere(0.09, x, y + 0.09, z, M['bone'], seg=10)
    for k in range(3):
        x, y, z = LEFT.p(CU0 + 0.75 + k * 0.28, sh, 0.25)
        cyl(0.06, 0.06, 0.14 + 0.05 * k, x, y, z, M['glass'], seg=10)
        cyl(0.065, 0.065, 0.02, x, y + 0.14 + 0.05 * k, z, M['brass'], seg=10)
BOTTLES = ['bottle_green', 'bottle_violet', 'bottle_orange', 'bottle_blue']
for i in range(7):
    x, y, z = LEFT.p(CU0 + 0.15 + i * 0.235, CTOP, 0.3)
    h = rng.uniform(0.2, 0.35)
    b = BOTTLES[i % 4]
    lathe([(0, 0), (0.07, 0), (0.08, h * 0.55), (0.03, h * 0.75), (0.025, h), (0, h)], x, y, z, M[b], seg=10)

# ------------------------------------------------------------------ floor: parquet in a dark border, the rug; the zodiac ceiling
box(XL, XR, 7.32, F2 - 0.004, ZB, ZF, M['marble_dark'])
box(XL + 0.4, XR - 0.4, F2 - 0.004, F2, ZB + 0.4, ZF - 0.4, M['parquet'])
for x0, x1, z0, z1 in ((XL + 0.36, XR - 0.36, ZB + 0.36, ZB + 0.4), (XL + 0.36, XR - 0.36, ZF - 0.4, ZF - 0.36), (XL + 0.36, XL + 0.4, ZB + 0.36, ZF - 0.36),
                       (XR - 0.4, XR - 0.36, ZB + 0.36, ZF - 0.36)):
    box(x0, x1, F2 - 0.004, F2 + 0.001, z0, z1, M['brass'])
box(9.4 - 1.9, 9.4 + 1.9, F2, F2 + 0.012, 0.9 - 1.9, 0.9 + 1.9, M['rug'])
box(XL, XR, CEIL, CEIL + 0.03, ZB, ZF, M['zodiac'])
for x0, x1, z0, z1 in ((XL + 0.45, XR - 0.45, ZB + 0.45, ZB + 0.6), (XL + 0.45, XR - 0.45, ZF - 0.6, ZF - 0.45), (XL + 0.45, XL + 0.6, ZB + 0.45, ZF - 0.45),
                       (XR - 0.6, XR - 0.45, ZB + 0.45, ZF - 0.45)):
    box(x0, x1, CEIL - 0.06, CEIL, z0, z1, M['gilt'], bevel=0.015)

# ------------------------------------------------------------------ bake-only: the walls' cores, the furniture that moves (where it rests)
FRONT_WINS = [(7.2 - 0.78, 7.2 + 0.78, 8.6, 12.4), (11.5 - 0.78, 11.5 + 0.78, 8.6, 12.4)]
for r in subtract(XL, XR, F2, CEIL, FRONT_WINS):
    blocker(box(r[0], r[1], r[2], r[3], ZF, ZF + 0.4, M['walnut']))
for r in subtract(XL, XR, F2, CEIL, [BWIN]):
    blocker(box(r[0], r[1], r[2], r[3], ZB - 0.4, ZB, M['walnut']))
for r in subtract(ZB, ZF, F2, CEIL, [(RWIN[0], RWIN[1], RWIN[2], RWIN[3]), (ZB, -2.25, F2, 11.0)]):
    blocker(box(XR, XR + 0.4, r[2], r[3], r[0], r[1], M['walnut']))
for r in subtract(ZB, ZF, F2, CEIL, [(ZB, -2.15, F2, 11.35)]):
    blocker(box(XL - 0.4, XL, r[2], r[3], r[0], r[1], M['walnut']))
blocker(cyl(1.3, 1.3, 0.97, 9.4, F2, 0.9, M['walnut'], seg=16))      # the table under its cloth

# ------------------------------------------------------------------ lights
for x0, x1, v0, v1 in FRONT_WINS:
    light('moon_front', 'AREA', ((x0 + x1) / 2, (v0 + v1) / 2, ZF + 0.1), MOON, 110, size=(x1 - x0) * 0.9, size_y=(v1 - v0) * 0.9, aim=(0, -0.3, -1), group='cool')
light('moon_back', 'AREA', ((BWIN[0] + BWIN[1]) / 2, (BWIN[2] + BWIN[3]) / 2, ZB - 0.1), MOON, 90, size=(BWIN[1] - BWIN[0]) * 0.9, size_y=(BWIN[3] - BWIN[2]) * 0.9,
      aim=(0, -0.3, 1), group='cool')
light('moon_side', 'AREA', (XR + 0.1, (RWIN[2] + RWIN[3]) / 2, (RWIN[0] + RWIN[1]) / 2), MOON, 110, size=(RWIN[1] - RWIN[0]) * 0.9, size_y=(RWIN[3] - RWIN[2]) * 0.9,
      aim=(-1, -0.3, 0), group='cool')

kit.build('seance', 'Sea', A['out'], A['size'], A['cool_size'], A['samples'],
          ambient=lambda nrm, ao: ao * np.array([0.08, 0.07, 0.12], np.float32),     # the house's dim, cool ambient
          hidden=lambda n, c: c[2] > ZF - 0.01 and n[2] > 0.5 and c[1] < F2)        # the floor's cut edge, under the house's trim
