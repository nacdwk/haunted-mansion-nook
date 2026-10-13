"""Build, light-bake and export the Library: the ground floor's left-hand room, where the books fly and the busts
watch you.

    blender -b --factory-startup -P blender/library.py -- --out blender/build --size 2048 --samples 256

Writes library.glb (Lib_main: the floor, the shelves and everything standing in the room, which stays put; Lib_back
and Lib_left: the dressing of the back and left walls, which melt with those facades), library_warm.png and
library_cool.png (sqrt-encoded irradiance) and library.json.

warm: the fire and the candles. cool: moonlight through the front windows, and a little ambient light.
The fire's flames, the ageing portrait, the busts, the sliding ladder, the flying books, the reader and the book, and
the globe stay procedural (js/rooms.js), and so do the front wall and the partition's door casing (js/house.js).
Nothing is put in the Doom Buggies' way: up through the hole in the floor and along z = 3.5 to the door into the
Endless Hall (the old railing round the hole crossed it). Coordinates match js/house.js and js/rooms.js.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
import kit
from kit import M, mat, box, cyl, lathe, sphere, prism, slab2d, rod, torus, Wall, subtract, runs_at, group, light, blocker, empty, hexcol

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 1024, 'samples': 256})
kit.reset_scene(A['samples'])

F1 = 0.8
XL, XR, ZB, ZF = -13.6, -4.87, -4.6, 4.6           # the room's wall faces: left facade, partition, back and front
CEIL = 7.0                                        # the first floor's slab
HOLE = (-13.6, -10.9, 2.0, 4.6)                   # where the ride comes up through the floor (x0, x1, z0, z1)
FRONT_WINS = [(-11.5 - 0.78, -11.5 + 0.78, 2.0, 5.8), (-7.2 - 0.78, -7.2 + 0.78, 2.0, 5.8)]
for name, col, rough in [('wallpaper', '#24392d', 0.85), ('wainscot', '#3a2216', 0.6), ('walnut', '#2a170d', 0.55), ('gilt', '#c9a24a', 0.4),
                         ('plaster', '#b9ad9e', 0.8), ('ceiling', '#8c6c50', 0.85), ('floor', '#5b3720', 0.6), ('rug', '#5a1420', 0.95), ('marble', '#bdb5c4', 0.35),
                         ('stone_dark', '#4f4a5e', 0.85), ('soot', '#1a1414', 0.95), ('iron', '#17131d', 0.5), ('bark', '#2b2129', 0.9),
                         ('brass', '#a8844e', 0.4), ('wax', '#efe6cf', 0.6), ('mahogany', '#4a1e14', 0.5), ('velvet', '#6a1a22', 0.95),
                         ('book_red', '#5a1a22', 0.7), ('book_green', '#1f3a2a', 0.7), ('book_blue', '#2a2346', 0.7), ('book_brown', '#6a4a1a', 0.7),
                         ('book_plum', '#3e2a52', 0.7)]:
    mat(name, col, rough)
BOOKS = ['book_red', 'book_green', 'book_blue', 'book_brown', 'book_plum']
WARM = (1.0, 0.65, 0.32)
FIRE = hexcol('#ff9a4c')
MOON = (0.55, 0.62, 1.0)
rng = random.Random(53)

def flame(x, y, z, s=1.0, power=21.0):
    empty(f'Flame_{len(kit.LIGHTS)}', x, y, z, flameScale=s)
    light('candle', 'POINT', (x, y + 0.03, z), WARM, power, size=0.03)

# ------------------------------------------------------------------ walls: base, panelled wainscot, chair rail, damask, cornice
WH = 2.0                                          # the wainscot's height, as the site's walls have it
PR = CEIL - 0.7                                   # the picture rail
CORNICE = [(0, CEIL - 0.4), (0.03, CEIL - 0.4), (0.05, CEIL - 0.37), (0.05, CEIL - 0.32), (0.09, CEIL - 0.29), (0.1, CEIL - 0.23), (0.16, CEIL - 0.19),
           (0.2, CEIL - 0.13), (0.22, CEIL - 0.08), (0.27, CEIL - 0.05), (0.28, CEIL), (0, CEIL)]
def dress(w, holes):
    L = w.length
    for a, b in runs_at(L, holes, F1 + 0.1):
        w.box(a, b, F1, F1 + 0.26, 0, 0.035, M['walnut'])
        w.mold(a, b, [(0, F1 + 0.26), (0.045, F1 + 0.26), (0.05, F1 + 0.28), (0.03, F1 + 0.3), (0, F1 + 0.3)], M['walnut'])
    for r in subtract(0, L, F1 + 0.3, F1 + WH - 0.12, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.018, M['wainscot'])
    for a, b in runs_at(L, holes, F1 + 0.9):
        n = max(1, round((b - a) / 0.9))
        pw = (b - a - (n + 1) * 0.12) / n
        if pw > 0.15:
            for i in range(n):
                u0 = a + 0.12 + i * (pw + 0.12)
                w.box(u0, u0 + pw, F1 + 0.42, F1 + WH - 0.24, 0.018, 0.036, M['wainscot'], bevel=0.012)
    for a, b in runs_at(L, holes, F1 + WH - 0.05):
        w.mold(a, b, [(0, F1 + WH - 0.12), (0.035, F1 + WH - 0.12), (0.05, F1 + WH - 0.09), (0.062, F1 + WH - 0.05), (0.05, F1 + WH - 0.01),
                      (0.03, F1 + WH + 0.02), (0, F1 + WH + 0.02)], M['walnut'])
    for r in subtract(0, L, F1 + WH + 0.02, PR, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.012, M['wallpaper'])
    for a, b in runs_at(L, holes, PR + 0.03):
        w.box(a, b, PR, PR + 0.06, 0, 0.035, M['walnut'])
    for r in subtract(0, L, PR + 0.06, CEIL - 0.4, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.012, M['plaster'])
    for a, b in runs_at(L, holes, CEIL - 0.2):
        w.mold(a, b, CORNICE, M['plaster'])
        w.mold(a, b, [(0.05, CEIL - 0.318), (0.078, CEIL - 0.318), (0.078, CEIL - 0.288), (0.05, CEIL - 0.288)], M['gilt'])

BACK = Wall((XL, 0, ZB), (1, 0, 0), (0, 0, 1), XR - XL)          # u = x - XL
LEFT = Wall((XL, 0, ZB), (0, 0, 1), (1, 0, 0), ZF - ZB)          # u = z - ZB
PART = Wall((XR, 0, ZB), (0, 0, 1), (-1, 0, 0), ZF - ZB)
SHELF_D = 0.55                                    # the shelves run wall to wall along the back
FIRE_U = (0.2 - 1.55 - ZB, 0.2 + 1.55 - ZB)       # the chimneypiece on the left wall, round z = 0.2
DOOR_U = (2.25 - ZB, ZF - ZB)                     # the partition's door, the ride's way on
group('left')
dress(LEFT, [(0, SHELF_D + 0.05, F1, CEIL), (FIRE_U[0], FIRE_U[1], F1, 3.36)])
group('main')
dress(PART, [(0, SHELF_D + 0.05, F1, CEIL), (DOOR_U[0], DOOR_U[1] + 0.1, F1, 4.75)])
group('back')
for r in subtract(XL, XR, CEIL - 0.4, CEIL, []):                  # above the shelves' crown: plaster and the cornice
    BACK.box(r[0] - XL, r[1] - XL, 6.78, CEIL - 0.4, 0, 0.012, M['plaster'])
BACK.mold(0, XR - XL, CORNICE, M['plaster'])
BACK.mold(0, XR - XL, [(0.05, CEIL - 0.318), (0.078, CEIL - 0.318), (0.078, CEIL - 0.288), (0.05, CEIL - 0.288)], M['gilt'])

# ------------------------------------------------------------------ the shelves along the back wall, wall to wall, in bays
group('main')
SX0, SX1, SY0, SY1, SZ = XL, XR, F1, 6.55, ZB
NSH = 6
SH = (SY1 - SY0) / NSH
box(SX0, SX1, SY0, SY1, SZ, SZ + 0.04, M['walnut'])                                  # its back
box(SX0, SX1, SY0, SY0 + 0.18, SZ, SZ + SHELF_D + 0.02, M['walnut'])                 # plinth
BAYS = 6
bay_x = [SX0 + (SX1 - SX0) * i / BAYS for i in range(BAYS + 1)]
for i, x in enumerate(bay_x):                                                        # uprights, the end ones against the walls
    x0, x1 = (x, x + 0.08) if i == 0 else ((x - 0.08, x) if i == BAYS else (x - 0.045, x + 0.045))
    box(x0, x1, SY0, SY1, SZ, SZ + SHELF_D + 0.03, M['walnut'])
    if 0 < i < BAYS:
        box(x - 0.07, x + 0.07, SY0 + 0.18, SY1, SZ + SHELF_D, SZ + SHELF_D + 0.04, M['walnut'], bevel=0.01)
for k in range(NSH + 1):
    y = SY0 + 0.18 + k * (SY1 - SY0 - 0.18) / NSH
    box(SX0, SX1, y - 0.03, y + 0.03, SZ, SZ + SHELF_D + 0.03, M['walnut'])
    box(SX0, SX1, y + 0.03, y + 0.05, SZ + SHELF_D, SZ + SHELF_D + 0.04, M['walnut'])                     # its lip
CROWN = [(0, SY1), (0.04, SY1), (0.06, SY1 + 0.04), (0.1, SY1 + 0.07), (0.14, SY1 + 0.11), (0.2, SY1 + 0.14), (0.22, SY1 + 0.17), (0, SY1 + 0.17)]   # the busts stand on it at 6.72
BACK.mold(0, XR - XL, [(d + SHELF_D - 0.02, v) for d, v in CROWN], M['walnut'])
box(SX0, SX1, SY1, SY1 + 0.17, SZ, SZ + SHELF_D, M['walnut'])
box(-13.3, -5.25, 6.28, 6.33, -3.93, -3.88, M['brass'])                             # the ladder's rail (the ladder is the site's)
for x in (-13.0, -9.3, -5.5):
    rod((x, 6.305, ZB + 0.04), (x, 6.305, -3.9), 0.015, M['brass'], seg=6)
SHELF_Y = [SY0 + 0.18 + k * (SY1 - SY0 - 0.18) / NSH + 0.05 for k in range(NSH)]
group('main', lowres=True)                        # the books are small and seen from across the room: half the lightmap's detail
for b in range(BAYS):
    for k, y in enumerate(SHELF_Y):
        x = bay_x[b] + 0.08
        xe = bay_x[b + 1] - 0.08
        top = SY0 + 0.18 + (k + 1) * (SY1 - SY0 - 0.18) / NSH - 0.03
        while x < xe - 0.06:
            bw = rng.uniform(0.05, 0.11)
            if x + bw > xe:
                break
            if rng.random() < 0.07:                                                  # a gap, or a book lying down
                if rng.random() < 0.5:
                    x += bw * 2.5
                    continue
                lw = rng.uniform(0.25, 0.32)
                if x + lw > xe:
                    break
                for j in range(rng.randint(1, 3)):
                    box(x, x + lw, y + j * 0.06, y + j * 0.06 + 0.055, SZ + 0.08, SZ + SHELF_D - 0.05, M[rng.choice(BOOKS)])
                x += lw + 0.01
                continue
            bh = (top - y) * rng.uniform(0.66, 0.92)
            bd = SHELF_D * rng.uniform(0.7, 0.9)
            m = M[rng.choice(BOOKS)]
            box(x, x + bw, y, y + bh, SZ + SHELF_D - 0.03 - bd, SZ + SHELF_D - 0.03, m)
            if rng.random() < 0.35:                                                  # gilt bands on its spine
                for v in (0.12, 0.82):
                    box(x + 0.004, x + bw - 0.004, y + bh * v, y + bh * v + 0.012, SZ + SHELF_D - 0.03, SZ + SHELF_D - 0.026, M['gilt'])
            x += bw + 0.004

# ------------------------------------------------------------------ the chimneypiece on the left wall (the fire is the site's)
group('main')
FZ = 0.2                                          # its middle; its mouth is 1.76 wide and 1.8 high, as the site's was
with kit.frame((XL, F1, FZ), ry=math.pi / 2):     # its own frame: x along the wall, z out into the room
    for s in (-1, 1):
        box(s * 0.88, s * 1.3, 0, 2.3, 0, 0.6, M['marble'])                          # jambs
        box(s * 0.84, s * 1.36, 0, 0.22, 0, 0.66, M['marble'], bevel=0.02)           # their plinths
        box(s * 0.92, s * 1.26, 0.22, 2.1, 0.6, 0.64, M['marble'])                   # pilasters
        for v in (0.4, 1.95):
            box(s * 0.9, s * 1.28, v, v + 0.06, 0.6, 0.67, M['marble'], bevel=0.01)
        box(s * 0.88, s * 1.32, 2.1, 2.3, 0.58, 0.68, M['marble'], bevel=0.02)       # their capitals
    box(-0.88, 0.88, 1.8, 2.3, 0, 0.6, M['marble'])                                 # the lintel
    box(-0.5, 0.5, 1.95, 2.2, 0.6, 0.63, M['marble'], bevel=0.01)                     # its tablet
    box(-0.14, 0.14, 1.72, 2.05, 0.6, 0.66, M['marble'], bevel=0.015)                 # keystone
    slab2d([(-1.5, 2.3), (1.5, 2.3), (1.56, 2.36), (1.56, 2.44), (-1.56, 2.44), (-1.56, 2.36)], -0.05, 0.78, M['marble'], plane='xy', bevel=0.012)  # the mantel
    box(-0.88, 0.88, 0, 1.8, 0.0, 0.04, M['soot'])                                   # the firebox
    for s in (-1, 1):
        slab2d([(0.04, 0), (0.6, 0), (0.6, 1.8), (0.04, 1.8)], s * 0.88 - (0.04 if s > 0 else 0), s * 0.88 + (0.04 if s < 0 else 0), M['soot'], plane='zy')
    box(-0.88, 0.88, 1.76, 1.8, 0.04, 0.6, M['soot'])
    box(-1.5, 1.5, 0, 0.05, 0.0, 1.05, M['stone_dark'])                              # the hearth
    for s in (-1, 1):                                                                 # andirons and the logs on them
        rod((s * 0.45, 0, 0.2), (s * 0.45, 0, 0.5), 0.02, M['iron'], seg=6)
        rod((s * 0.45, 0, 0.5), (s * 0.45, 0.32, 0.56), 0.02, M['iron'], seg=6)
        sphere(0.04, s * 0.45, 0.34, 0.56, M['brass'], seg=8)
    for lx, a in ((-0.15, 0.2), (0.18, -0.25)):
        with kit.frame((lx, 0.14, 0.3), ry=a):
            rod((-0.42, 0, 0), (0.42, 0, 0), 0.085, M['bark'], seg=7)
    for k in range(9):                                                                # the fender
        x = -1.1 + k * 0.275
        rod((x, 0.05, 1.0), (x, 0.24, 1.0), 0.012, M['brass'], seg=5)
    rod((-1.1, 0.24, 1.0), (1.1, 0.24, 1.0), 0.018, M['brass'], seg=6)
    for s in (-1, 1):
        rod((s * 1.1, 0.24, 1.0), (s * 1.1, 0.24, 0.62), 0.018, M['brass'], seg=6)
for z in (-0.75, 1.15):                                                               # a candlestick each end of the mantel
    with kit.frame((XL + 0.35, F1 + 2.44, z), s=0.8):
        lathe([(0, 0), (0.12, 0), (0.12, 0.03), (0.06, 0.06), (0.035, 0.12), (0.03, 0.62), (0.06, 0.68), (0.04, 0.72), (0, 0.72)], 0, 0, 0, M['brass'], seg=12)
        cyl(0.04, 0.038, 0.3, 0, 0.72, 0, M['wax'], seg=8)
    flame(XL + 0.35, F1 + 2.44 + 1.03 * 0.8, z, 0.8)

# ------------------------------------------------------------------ the floor: boards round the hole the ride comes up through, a rug, a railing
for r in subtract(XL, XR, ZB, ZF, [HOLE]):
    box(r[0], r[1], 0.42, F1, r[2], r[3], M['floor'])
box(-8.8 - 2.3, -8.8 + 2.3, F1, F1 + 0.012, 0.2 - 1.55, 0.2 + 1.55, M['rug'])
for (x0, x1, z0, z1) in ((HOLE[0], HOLE[1] + 0.08, HOLE[2] - 0.08, HOLE[2]), (HOLE[1], HOLE[1] + 0.08, HOLE[2], ZF)):
    box(x0, x1, 0.42, F1 + 0.02, z0, z1, M['walnut'])                               # the hole's trim
POSTS = [(-13.4, 2.0), (-12.15, 2.0), (-10.9, 2.0), (-10.9, 2.6)]                   # the rail stops short of the buggies' way out
for x, z in POSTS:
    lathe([(0, 0), (0.08, 0), (0.08, 0.05), (0.05, 0.08), (0.045, 0.85), (0.06, 0.9), (0, 0.9)], x, F1, z, M['brass'], seg=10)
    sphere(0.09, x, F1 + 1.0, z, M['brass'], seg=10)
for (a, b) in zip(POSTS, POSTS[1:]):
    rod((a[0], F1 + 0.95, a[1]), (b[0], F1 + 0.95, b[1]), 0.03, M['brass'], seg=8)
    rod((a[0], F1 + 0.45, a[1]), (b[0], F1 + 0.45, b[1]), 0.02, M['brass'], seg=6)

# ------------------------------------------------------------------ the coffered ceiling
group('main')
box(XL, XR, CEIL - 0.03, CEIL, ZB, ZF, M['ceiling'])
for x in np.linspace(XL, XR, 5)[1:-1]:
    box(x - 0.11, x + 0.11, CEIL - 0.24, CEIL - 0.03, ZB, ZF, M['walnut'])
for z in np.linspace(ZB, ZF, 5)[1:-1]:
    box(XL, XR, CEIL - 0.22, CEIL - 0.03, z - 0.1, z + 0.1, M['walnut'])
for x in np.linspace(XL, XR, 5)[1:-1]:
    for z in np.linspace(ZB, ZF, 5)[1:-1]:
        lathe([(0, 0), (0.16, 0), (0.12, -0.05), (0.05, -0.08), (0, -0.1)], x, CEIL - 0.24, z, M['gilt'], seg=12)   # bosses where they cross

# ------------------------------------------------------------------ the furniture: a wingback, a reading table, the busts' pedestals
with kit.frame((-10.4, F1, 0.3), ry=-0.85):       # the reader's chair (js/rooms.js)
    for lx, lz in ((-0.4, -0.35), (0.4, -0.35), (-0.4, 0.35), (0.4, 0.35)):
        lathe([(0, 0), (0.03, 0), (0.045, 0.06), (0.035, 0.15), (0, 0.15)], lx, 0, lz, M['walnut'], seg=8)
    box(-0.5, 0.5, 0.15, 0.5, -0.45, 0.45, M['velvet'], bevel=0.04)
    box(-0.42, 0.42, 0.5, 0.6, -0.36, 0.42, M['velvet'], bevel=0.05)              # the cushion
    slab2d([(-0.48, 0.5), (-0.48, 1.62), (-0.3, 1.78), (0.3, 1.78), (0.48, 1.62), (0.48, 0.5)], -0.48, -0.28, M['velvet'], plane='xy', bevel=0.05)
    for s in (-1, 1):
        slab2d([(-0.45, 0.5), (0.36, 0.5), (0.4, 0.86), (0.3, 0.96), (-0.1, 0.98), (-0.3, 1.5), (-0.45, 1.56)], s * 0.5 - 0.1, s * 0.5 + 0.1, M['velvet'], plane='zy', bevel=0.04)
with kit.frame((-7.0, F1, 1.0)):                  # the reading table
    box(-0.64, 0.64, 0.78, 0.85, -0.44, 0.44, M['mahogany'], bevel=0.02)
    box(-0.56, 0.56, 0.66, 0.78, -0.36, 0.36, M['mahogany'])
    for lx in (-0.5, 0.5):
        for lz in (-0.3, 0.3):
            lathe([(0, 0), (0.035, 0), (0.05, 0.08), (0.03, 0.3), (0.045, 0.5), (0.04, 0.66), (0, 0.66)], lx, 0, lz, M['mahogany'], seg=8)
    for i, (bx, bz, h) in enumerate(((-0.3, -0.1, 0.0), (-0.28, -0.12, 0.06), (0.32, 0.18, 0.0))):   # books left on it
        box(bx - 0.16, bx + 0.16, 0.85 + h, 0.9 + h, bz - 0.12, bz + 0.12, M[BOOKS[i]])
with kit.frame((-7.0, F1 + 0.85, 1.0), s=0.6):    # the candelabra on it
    lathe([(0, 0), (0.18, 0), (0.18, 0.04), (0.08, 0.08), (0.04, 0.2), (0.035, 0.78), (0.06, 0.84), (0, 0.84)], 0, 0, 0, M['brass'], seg=12)
    rod((-0.35, 0.72, 0), (0.35, 0.72, 0), 0.025, M['brass'], seg=6)
    for ax in (-0.35, 0.0, 0.35):
        yy = 0.86 if ax == 0 else 0.74
        cyl(0.04, 0.065, 0.05, ax, yy - 0.02, 0, M['brass'], seg=8)
        cyl(0.05, 0.048, 0.26, ax, yy + 0.02, 0, M['wax'], seg=8)
for ax, yy in ((-0.35, 0.74), (0.0, 0.86), (0.35, 0.74)):
    flame(-7.0 + ax * 0.6, F1 + 0.85 + (yy + 0.29) * 0.6, 1.0, 0.6)
for x, z, h in ((-12.9, -2.3, 1.15), (-8.2, -3.45, 1.0)):                           # pedestals for the busts (js/rooms.js)
    with kit.frame((x, F1, z)):
        box(-0.3, 0.3, 0, 0.1, -0.3, 0.3, M['marble'], bevel=0.015)
        box(-0.26, 0.26, 0.1, 0.16, -0.26, 0.26, M['marble'], bevel=0.01)
        lathe([(0, 0.16), (0.2, 0.16), (0.16, 0.24), (0.15, h - 0.24), (0.19, h - 0.18), (0, h - 0.18)], 0, 0, 0, M['marble'], seg=14)
        box(-0.28, 0.28, h - 0.18, h, -0.28, 0.28, M['marble'], bevel=0.015)

# ------------------------------------------------------------------ bake-only: the walls round it, the slab above, the tunnel below the hole
for r in subtract(XL, XR, F1, CEIL, FRONT_WINS):
    blocker(box(r[0], r[1], r[2], r[3], ZF, ZF + 0.4, M['walnut']))
blocker(box(XL - 0.4, XR + 0.4, F1, CEIL, ZB - 0.4, ZB, M['walnut']))
blocker(box(XL - 0.4, XL, F1, CEIL, ZB, ZF, M['walnut']))
for r in subtract(ZB, ZF, F1, CEIL, [(DOOR_U[0] + ZB, ZF, F1, 4.4)]):
    blocker(box(XR, XR + 0.4, r[2], r[3], r[0], r[1], M['walnut']))
blocker(box(XL - 0.4, XR + 0.4, CEIL, CEIL + 0.32, ZB - 0.4, ZF + 0.4, M['walnut']))
blocker(box(XL - 0.4, XR + 0.4, -1.0, 0.42, ZB - 0.4, ZF + 0.4, M['walnut']))

# ------------------------------------------------------------------ lights
light('fire', 'POINT', (XL + 0.35, F1 + 0.55, FZ), FIRE, 380, size=0.35)              # the fire in the grate
light('fire_glow', 'POINT', (-11.2, F1 + 2.6, 0.6), FIRE, 520, size=0.6)              # js/rooms.js's light round the hearth
for (x0, x1, v0, v1) in FRONT_WINS:
    light('moon_front', 'AREA', ((x0 + x1) / 2, (v0 + v1) / 2, ZF + 0.15), MOON, 90, size=(x1 - x0) * 0.9, size_y=(v1 - v0) * 0.9,
          aim=(0, -0.3, -1), group='cool')

def hidden(n, c):
    """Faces no one sees: the floor's underside and its cut edge under the house's trim, the ceiling's top, and the
    backs of the shelves and of the walls' dressing."""
    if n[1] < -0.9 and c[1] < 0.43 or n[1] > 0.9 and c[1] > CEIL - 0.001:
        return True
    if n[2] > 0.9 and c[2] > ZF - 0.01 and c[1] < F1:
        return True
    return n[2] < -0.9 and c[2] < ZB + 0.001 or n[0] < -0.9 and c[0] < XL + 0.001 or n[0] > 0.9 and c[0] > XR - 0.001

kit.build('library', 'Lib', A['out'], A['size'], A['cool_size'], A['samples'], hidden=hidden,
          ambient=lambda nrm, ao: ao * np.array([0.08, 0.07, 0.12], np.float32))     # the house's dim, cool ambient
