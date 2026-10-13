"""Build, light-bake and export the basement: the Portrait Hall under the front lawn, where the Doom Buggies are
boarded and where the ride ends at the mirror.

    blender -b --factory-startup -P blender/basement.py -- --out blender/build --size 2048 --samples 256

Writes basement.glb (Base_main: the hall, which never melts away), basement_warm.png and basement_cool.png
(sqrt-encoded irradiance) and basement.json.

warm: the blue-flamed sconces, the lanterns over the track and the attendant's, and the hall's two eerie fill lights
(js/rooms.js). cool: the night down the cellar opening the ride descends through, and a little ambient light.
The lightning portraits, the mirror, the attendant, the raven, the cobwebs, the gears in the tower's shaft and the
board's lettering stay procedural (js/rooms.js, js/house.js), and so do the earth round the hall and the nook's frame.
Nothing is put in the Doom Buggies' way: down the ramp from the cellar doors, along z = 8.2 and out through the
tunnel. Coordinates match js/house.js (buildBase) and js/rooms.js (basement).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
import kit
from kit import M, mat, box, cyl, lathe, sphere, prism, slab2d, rod, torus, Wall, subtract, runs_at, group, light, blocker, empty, hexcol

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 1024, 'samples': 256})
kit.reset_scene(A['samples'])

BX0, BX1, BZ0, BZ1, BY0, BY1 = -21.6, 20.5, 5.8, 10.5, -5.5, -0.6     # the hall (js/house.js D)
PY0 = -6.0
WF = BZ0 + 0.22                                    # the back wall's face
TUN = (-20.6, -18.0, BY0, -2.4)                    # the tunnel the ride leaves by (x0, x1, y0, y1)
MIR = (8.0, 12.0, -5.15, -1.45)                    # the mirror's niche
HOLE = (15.4, 20.5, 7.0, 9.4)                      # the cellar opening the ride comes down through (x0, x1, z0, z1)
DX0, DX1 = -17.6, 13.0                             # the dressed stretch of the back wall
BEAMS = [BX0 + 1.2 + 2.6 * k for k in range(16)]   # the ceiling's beams (js/house.js)
for name, col, rough in [('stone', '#4f4a5e', 0.9), ('flags', '#5a5468', 0.8), ('damask', '#251b3b', 0.85), ('wainscot', '#24140c', 0.6),
                         ('walnut', '#2a170d', 0.55), ('wood_dark', '#3a2214', 0.8), ('gilt', '#c9a24a', 0.4), ('brass', '#a8844e', 0.4),
                         ('iron', '#17131d', 0.5), ('velvet', '#5e1426', 0.95), ('wax', '#efe6cf', 0.6), ('glass', '#3a2412', 0.3)]:
    mat(name, col, rough)
WARM = (1.0, 0.65, 0.32)
BLUE_FLAME = hexcol('#7ad8ff')                     # MAT.flameBlue
NIGHT = (0.55, 0.62, 1.0)

def flame(x, y, z, s=1.0, power=21.0, blue=False):
    if blue:
        empty(f'Flame_{len(kit.LIGHTS)}', x, y, z, flameScale=s, flameBlue=1)
    else:
        empty(f'Flame_{len(kit.LIGHTS)}', x, y, z, flameScale=s)
    light('candle', 'POINT', (x, y + 0.03, z), BLUE_FLAME if blue else WARM, power, size=0.03)

# ------------------------------------------------------------------ floor, ceiling, end walls and the proscenium
group('main')
box(BX0, BX1, PY0, BY0, BZ0, BZ1, M['flags'])
box(BX0 + 0.4, 13.2, BY0, BY0 + 0.04, 6.9, 9.5, M['velvet'])          # the runner, as the site had it
for z0, z1 in ((6.85, 6.95), (9.45, 9.55)):
    box(BX0 + 0.4, 13.2, BY0, BY0 + 0.05, z0, z1, M['gilt'])
for r in subtract(BX0, BX1, BZ0, BZ1, [HOLE]):                      # boards, open over the ramp
    box(r[0], r[1], BY1 - 0.06, BY1, r[2], r[3], M['wood_dark'])
for x in BEAMS:
    runs = [(BZ0, HOLE[2] - 0.18), (HOLE[3] + 0.18, BZ1)] if HOLE[0] - 0.2 < x < HOLE[1] + 0.2 else [(BZ0, BZ1)]
    for z0, z1 in runs:
        box(x - 0.18, x + 0.18, BY1 - 0.38, BY1 - 0.06, z0, z1, M['walnut'])
for z0, z1 in ((HOLE[2] - 0.18, HOLE[2]), (HOLE[3], HOLE[3] + 0.18)):   # trimmers round the opening
    box(HOLE[0] - 0.2, BX1 - 0.3, BY1 - 0.38, BY1 - 0.06, z0, z1, M['walnut'])
box(BX0, BX1, BY1 - 0.55, BY1 + 0.25, BZ1 - 0.25, BZ1 + 0.18, M['walnut'])   # the proscenium's beam
CORBEL = [(BZ1 + 0.1, -1.1), (BZ1 + 0.1, -1.72), (BZ1 - 0.04, -1.72), (BZ1 - 0.12, -1.6), (BZ1 - 0.22, -1.45), (BZ1 - 0.36, -1.33),
          (BZ1 - 0.52, -1.27), (BZ1 - 0.6, -1.18), (BZ1 - 0.6, -1.1)]
for x in BEAMS:
    slab2d(CORBEL, x - 0.2, x + 0.2, M['walnut'], plane='zy', bevel=0.015)
for x in (BX0, BX1):                                                # posts at its ends
    box(x - 0.25, x + 0.25, PY0, 0, BZ1 - 0.4, BZ1 + 0.2, M['walnut'])
box(BX0, BX0 + 0.3, BY0, BY1, BZ0, BZ1, M['stone'])
for r in subtract(BZ0, BZ1, BY0, BY1, [(HOLE[2], HOLE[3], -2.0, BY1)]):   # the right end, open where the ramp comes in
    box(BX1 - 0.3, BX1, r[2], r[3], r[0], r[1], M['stone'])

# ------------------------------------------------------------------ the back wall: stone, and dressed between the tunnel and the boarding
for r in subtract(BX0, BX1, BY0, BY1, [TUN, MIR]):
    box(r[0], r[1], r[2], r[3], BZ0 - 0.01, WF, M['stone'])
w = Wall((0, 0, WF), (1, 0, 0), (0, 0, 1), BX1)
DH = [(MIR[0] - 0.28, MIR[1] + 0.28, BY0, BY1)]                     # the mirror's frame interrupts the dressing
def free_runs_at(v):
    blocks = [(h[0], h[1]) for h in DH if h[2] < v < h[3]]
    return kit.free_runs(DX0, DX1, blocks)
for a, b in free_runs_at(BY0 + 0.1):                                # baseboard, wainscot and its panels, chair rail
    w.box(a, b, BY0, BY0 + 0.24, 0, 0.1, M['walnut'])
    w.mold(a, b, [(0, BY0 + 0.24), (0.1, BY0 + 0.24), (0.07, BY0 + 0.3), (0, BY0 + 0.3)], M['walnut'])
    w.box(a, b, BY0 + 0.24, -4.12, 0, 0.06, M['wainscot'])
    n = max(1, round((b - a) / 1.15))
    pw = (b - a - (n + 1) * 0.14) / n
    for i in range(n):
        u0 = a + 0.14 + i * (pw + 0.14)
        w.box(u0, u0 + pw, BY0 + 0.42, -4.3, 0.06, 0.085, M['wainscot'], bevel=0.015)
    w.mold(a, b, [(0, -4.14), (0.05, -4.14), (0.08, -4.1), (0.12, -4.06), (0.1, -4.0), (0.06, -3.97), (0, -3.97)], M['walnut'])
for a, b in free_runs_at(-2.0):                                     # damask, picture rail and cornice
    w.box(a, b, -3.97, -1.32, 0, 0.08, M['damask'])
    w.mold(a, b, [(0, -1.32), (0.1, -1.32), (0.12, -1.29), (0.1, -1.25), (0, -1.25)], M['walnut'])
    w.box(a, b, -1.25, -1.0, 0, 0.04, M['damask'])
    w.mold(a, b, [(0, -1.0), (0.06, -1.0), (0.08, -0.96), (0.14, -0.92), (0.2, -0.82), (0.22, -0.74), (0.26, -0.7), (0.26, BY1 - 0.06), (0, BY1 - 0.06)], M['walnut'])

# ------------------------------------------------------------------ the tunnel's mouth: an arch of voussoirs with a keystone
TC, TR, TRY = (TUN[0] + TUN[1]) / 2, (TUN[1] - TUN[0]) / 2, 0.6     # its middle, half-width and the arch's rise
TSPRING = TUN[3] - TRY
arc = [(TC + TR * math.cos(a), TSPRING + TRY * math.sin(a)) for a in np.linspace(0, math.pi, 17)]
slab2d([(TUN[0], TUN[3]), (TUN[1], TUN[3]), (TUN[1], TSPRING)] + arc + [(TUN[0], TSPRING)], BZ0 - 0.01, WF, M['stone'], plane='xy')
for i in range(9):
    a0, a1 = math.pi * i / 9, math.pi * (i + 1) / 9
    pts = [(TC + (TR + d) * math.cos(a), TSPRING + (TRY + d * 0.62) * math.sin(a)) for a, d in ((a0, 0), (a1, 0), (a1, 0.42), (a0, 0.42))]
    slab2d(pts, WF - 0.02, WF + 0.1 if i != 4 else WF + 0.14, M['stone'], plane='xy', bevel=0.02)
for x0, x1 in ((TUN[0] - 0.42, TUN[0]), (TUN[1], TUN[1] + 0.42)):    # its jambs
    for k in range(4):
        y = BY0 + k * (TSPRING - BY0) / 4
        box(x0 - (0.04 if k % 2 else 0), x1 + (0.04 if k % 2 else 0), y + 0.01, y + (TSPRING - BY0) / 4 - 0.01, WF - 0.02, WF + 0.1, M['stone'], bevel=0.02)

# ------------------------------------------------------------------ the mirror's niche: a gilt frame with a crest
mx0, mx1, my0, my1 = MIR
for (x0, x1, y0, y1) in ((mx0 - 0.26, mx0, my0 - 0.26, my1 + 0.26), (mx1, mx1 + 0.26, my0 - 0.26, my1 + 0.26),
                         (mx0, mx1, my1, my1 + 0.26), (mx0, mx1, my0 - 0.26, my0)):
    box(x0, x1, y0, y1, BZ0 - 0.1, WF + 0.16, M['gilt'], bevel=0.03)
for (p0, p1) in (((mx0 - 0.02, my0 - 0.02), (mx1 + 0.02, my0 - 0.02)), ((mx1 + 0.02, my0 - 0.02), (mx1 + 0.02, my1 + 0.02)),
                 ((mx1 + 0.02, my1 + 0.02), (mx0 - 0.02, my1 + 0.02)), ((mx0 - 0.02, my1 + 0.02), (mx0 - 0.02, my0 - 0.02))):
    rod((p0[0], p0[1], WF + 0.17), (p1[0], p1[1], WF + 0.17), 0.035, M['gilt'], seg=6)      # the inner bead
cx = (mx0 + mx1) / 2
slab2d([(cx + 0.55 * math.cos(a), my1 + 0.26 + 0.45 * math.sin(a)) for a in np.linspace(0, math.pi, 15)], WF, WF + 0.1, M['gilt'], plane='xy', bevel=0.02)
sphere(0.13, cx, my1 + 0.48, WF + 0.12, M['gilt'], seg=10)
for s in (-1, 1):                                                   # scrolls at its feet
    with kit.frame((cx + s * 0.62, my1 + 0.34, WF + 0.08)):
        torus(0.09, 0.03, M['gilt'], seg=12, ring=5)

# ------------------------------------------------------------------ sconces with blue candles, and the lanterns over the track
for x in (-16.2, -10.5, -4.7, 1.1, 6.9):
    with kit.frame((x, -2.4, WF + 0.08)):
        with kit.frame((0, 0, 0), rx=math.pi / 2):                  # its rosette, flat on the wall
            lathe([(0, 0), (0.11, 0), (0.12, 0.012), (0.1, 0.028), (0.05, 0.04), (0, 0.04)], 0, 0, 0, M['brass'], seg=14)
        rod((0, 0, 0.03), (0, -0.04, 0.16), 0.016, M['brass'], seg=6)
        rod((0, -0.04, 0.16), (0, 0.03, 0.28), 0.016, M['brass'], seg=6)
        lathe([(0, 0), (0.035, 0), (0.07, 0.04), (0.06, 0.05), (0, 0.05)], 0, 0.02, 0.28, M['brass'], seg=10)
        cyl(0.028, 0.026, 0.22, 0, 0.07, 0.28, M['wax'], seg=8)
    flame(x, -2.4 + 0.3, WF + 0.08 + 0.28, 1.0, blue=True)
LANTERN_X = (-15.0, -6.0, 3.0, 12.6)
def lantern(x, y, z, s):
    """An iron lantern hanging on its chain, its glass glowing amber (the flame inside isn't drawn)."""
    with kit.frame((x, y, z), s=s):
        box(-0.12, 0.12, 0, 0.04, -0.12, 0.12, M['iron'])
        for px, pz in ((-0.11, -0.11), (0.11, -0.11), (-0.11, 0.11), (0.11, 0.11)):
            box(px - 0.015, px + 0.015, 0.04, 0.34, pz - 0.015, pz + 0.015, M['iron'])
        box(-0.1, 0.1, 0.05, 0.33, -0.1, 0.1, M['glass'])
        with kit.frame((0, 0.34, 0), ry=math.pi / 4):
            cyl(0.2, 0.02, 0.18, 0, 0, 0, M['iron'], seg=4)
        with kit.frame((0, 0.58, 0)):
            torus(0.05, 0.012, M['iron'], seg=10, ring=4)
for x in LANTERN_X:
    lantern(x, -2.0, 8.6, 1.1)
    rod((x, -2.0 + 0.62 * 1.1, 8.6), (x, BY1 - 0.06, 8.6), 0.012, M['iron'], seg=4)
    light('lantern', 'POINT', (x, -2.0 + 0.19 * 1.1, 8.6), WARM, 26, size=0.08)

# ------------------------------------------------------------------ the boarding: platform, stanchions and ropes, the board behind the sign
box(13.0, 18.6, BY0, BY0 + 0.25, 9.5, 10.45, M['wood_dark'])
box(13.0, 18.6, BY0 + 0.25, BY0 + 0.3, 9.48, 9.6, M['gilt'])
POSTS = (13.5, 15.2, 16.9, 18.3)
for x in POSTS:
    lathe([(0, 0), (0.11, 0), (0.1, 0.03), (0.04, 0.06), (0.025, 0.12), (0.025, 0.86), (0.04, 0.9), (0.05, 0.95), (0.03, 1.0), (0, 1.0)],
          x, BY0 + 0.25, 10.2, M['brass'], seg=10)
for a, b in zip(POSTS, POSTS[1:]):                                   # velvet ropes, sagging between them
    pts = [(a + (b - a) * t, BY0 + 0.25 + 0.92 - 0.16 * math.sin(math.pi * t), 10.2) for t in np.linspace(0, 1, 7)]
    for p, q in zip(pts, pts[1:]):
        rod(p, q, 0.025, M['velvet'], seg=6)
box(13.5, 17.9, -1.98, -1.12, WF, WF + 0.06, M['walnut'], bevel=0.02)  # the board the sign is painted on
for (x0, x1, y0, y1) in ((13.5, 17.9, -1.98, -1.92), (13.5, 17.9, -1.18, -1.12), (13.5, 13.56, -1.98, -1.12), (17.84, 17.9, -1.98, -1.12)):
    box(x0, x1, y0, y1, WF + 0.06, WF + 0.09, M['gilt'])

# ------------------------------------------------------------------ the ramp down from the cellar doors: deck on trestles, a rail on the open side
RX0, RY0, RX1, RY1 = 22.0, -0.2, 14.4, BY0
ry = lambda x: RY1 + (RY0 - RY1) * (x - RX1) / (RX0 - RX1)          # the deck's top over x
slab2d([(RX1, RY1 - 0.15), (RX0, RY0 - 0.15), (RX0, RY0 + 0.02), (RX1, RY1 + 0.02)], 7.0, 9.4, M['wood_dark'], plane='xy')
for i in range(6):
    px = RX1 + (RX0 - RX1) * (i + 0.5) / 6
    if px > BX1 - 0.4:
        continue
    for pz in (7.15, 9.25):
        box(px - 0.08, px + 0.08, BY0, ry(px) - 0.15, pz - 0.08, pz + 0.08, M['walnut'])
    box(px - 0.06, px + 0.06, BY0 + 0.4, BY0 + 0.52, 7.15, 9.25, M['walnut'])        # its cross-tie
for i in range(6):                                                  # the rail on the open side
    px = RX1 + 0.3 + (RX0 - RX1 - 0.6) * i / 5
    if px < BX1 - 0.4:
        rod((px, ry(px), 9.36), (px, ry(px) + 0.85, 9.36), 0.025, M['iron'], seg=6)
xe = BX1 - 0.4
rod((RX1 + 0.3, ry(RX1 + 0.3) + 0.85, 9.36), (xe, ry(xe) + 0.85, 9.36), 0.03, M['iron'], seg=6)

# ------------------------------------------------------------------ two velvet benches for those waiting, under the sconces between the portraits
for x in (-10.5, 1.1):
    with kit.frame((x, BY0, 6.42)):
        box(-0.8, 0.8, 0.36, 0.46, -0.22, 0.22, M['walnut'], bevel=0.02)
        box(-0.76, 0.76, 0.46, 0.56, -0.2, 0.2, M['velvet'], bevel=0.04)
        for lx in (-0.7, 0.7):
            for lz in (-0.16, 0.16):
                lathe([(0, 0), (0.035, 0), (0.03, 0.12), (0.045, 0.24), (0.03, 0.36), (0, 0.36)], lx, 0, lz, M['walnut'], seg=8)

# ------------------------------------------------------------------ bake-only: the earth round the hall, the tunnel's throat
blocker(box(-24.0, 32.0, PY0 - 1.0, 0.0, -8.0, BZ0 - 0.01, M['stone']))              # behind the back wall
blocker(box(-24.0, BX0, PY0 - 1.0, 0.0, BZ0 - 0.01, BZ1, M['stone']))              # the left end
blocker(box(BX1, 32.0, PY0 - 1.0, 0.0, BZ0 - 0.01, BZ1, M['stone']))              # the right end
for r in subtract(BX0, BX1, BZ0, BZ1, [HOLE]):
    blocker(box(r[0], r[1], BY1, 0.0, r[2], r[3], M['stone']))                      # above the boards
blocker(box(-24.0, 32.0, PY0 - 1.0, PY0, BZ0 - 0.01, BZ1, M['stone']))              # under the floor

# ------------------------------------------------------------------ lights
light('fill_teal', 'POINT', (-9.5, -1.6, 8.6), hexcol('#58e0cf'), 460, size=0.4)    # js/rooms.js's two fill lights
light('fill_blue', 'POINT', (3.0, -1.6, 8.6), hexcol('#7aa8ff'), 420, size=0.4)
light('attendant_lantern', 'POINT', (15.5, BY0 + 1.2 + 0.19 * 0.9, 7.35), WARM, 22, size=0.06)
light('night_in', 'AREA', ((HOLE[0] + HOLE[1]) / 2, 0.6, (HOLE[2] + HOLE[3]) / 2), NIGHT, 160, size=HOLE[1] - HOLE[0], size_y=HOLE[3] - HOLE[2],
      aim=(-0.35, -1, 0), group='cool')

def hidden(n, c):
    """Faces no one sees that the buried-face test can miss where they meet the earth's edges: the floor's underside,
    the boards' backs, the back wall's back and the end walls' outsides."""
    if n[1] < -0.9 and c[1] < PY0 + 0.01 or n[1] > 0.9 and abs(c[1] - BY1) < 0.005 and c[2] < BZ1 - 0.01:
        return True
    if n[2] < -0.9 and c[2] < BZ0 + 0.0:
        return True
    return n[0] < -0.9 and c[0] < BX0 + 0.01 or n[0] > 0.9 and c[0] > BX1 - 0.01

kit.build('basement', 'Base', A['out'], A['size'], A['cool_size'], A['samples'], hidden=hidden,
          ambient=lambda nrm, ao: ao * np.array([0.08, 0.07, 0.12], np.float32))     # the house's dim, cool ambient
