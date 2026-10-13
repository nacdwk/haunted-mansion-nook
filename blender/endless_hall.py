"""Build, light-bake and export the Endless Hall: the middle room of the ground floor, behind the front door, and the
forced-perspective corridor through the arch in its back wall, where the candelabra floats.

    blender -b --factory-startup -P blender/endless_hall.py -- --out blender/build --size 2048 --samples 256

Writes endless.glb (End_main: the floor, ceiling, partitions' dressing, furniture and the corridor, which stay put;
End_back: the back wall's dressing and the arch, which melt with the back facade), endless_warm.png and
endless_cool.png (sqrt-encoded irradiance) and endless.json.

warm: the chandelier's eight candles, the room's sconces and the candles down the corridor.
cool: moonlight through the front windows and the door's fanlight, and a little ambient light.

The front wall stays procedural (it melts away when the house opens, and the ride faces the other way), and so do
the walls' cores, the track's door casings, the doors' slabs, the clock's dial, hands and pendulum, the floating
candelabra and every flame (js/rooms.js). Coordinates match js/house.js.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
from mathutils import Vector
import kit
from kit import M, V, mat, box, cyl, lathe, sphere, prism, slab2d, rod, torus, Wall, subtract, runs_at, group, light, blocker, hexcol, empty

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 1536, 'samples': 256})
kit.reset_scene(A['samples'])

F1 = 0.8
XL, XR, ZB, ZF = -4.47, 4.47, -4.6, 4.6          # the room's wall faces: partitions, back and front
CEIL = 6.97                                       # just under the procedural slab
for name, col, rough in [('wallpaper', '#5a3d5c', 0.85), ('wainscot', '#3a2418', 0.6), ('walnut', '#2a170d', 0.55), ('gilt', '#c9a24a', 0.4),
                         ('brass', '#a8844e', 0.4), ('plaster', '#b9ad9e', 0.8), ('ceiling', '#a99d90', 0.85), ('checker', '#76707c', 0.3),
                         ('marble_dark', '#2e2834', 0.3), ('rug', '#3a1a4a', 0.95), ('wax', '#efe6cf', 0.6), ('crystal', '#cfe8ff', 0.2),
                         ('mirror', '#3a3e5a', 0.1), ('void', '#050308', 1.0), ('stone_dark', '#4f4a5e', 0.85),
                         ('c_paper', '#5a3d5c', 0.85), ('c_wainscot', '#3a2418', 0.6), ('c_runner', '#5e1426', 0.95), ('c_floor', '#3a2214', 0.7)]:
    mat(name, col, rough)
WARM = (1.0, 0.65, 0.32)                          # as the Grand Hall's candles (blender/grand_hall.py), in Blender watts like its
MOON = (0.55, 0.62, 1.0)                          # lights, which js/baked.js's brightness constants assume
FLAME = 0.7                                       # the site's candle flame scale

def flame(x, y, z, s=1.0, power=21.0):
    """A candle flame: drawn by the site (an empty it finds by name) and a warm light for the bake."""
    empty(f'Flame_{len(kit.LIGHTS)}', x, y, z, flameScale=FLAME * s)
    light('candle', 'POINT', (x, y + 0.02 * s, z), WARM, power, size=0.03 * s)

# ------------------------------------------------------------------ walls: base, panelled wainscot, chair rail, paper, cornice
CORNICE = [(0, 6.55), (0.03, 6.55), (0.05, 6.58), (0.05, 6.635), (0.09, 6.66), (0.1, 6.72), (0.16, 6.76), (0.2, 6.82), (0.22, 6.88),
           (0.27, 6.91), (0.28, CEIL), (0, CEIL)]
def dress(w, holes):
    """The wall's dressing round its openings [(u0, u1, v0, v1)]: baseboard, raised-panel wainscot, chair rail,
    wallpaper, picture rail, plaster frieze and a stepped cornice with a gilt bead."""
    L = w.length
    for a, b in runs_at(L, holes, F1 + 0.1):
        w.box(a, b, F1, F1 + 0.26, 0, 0.035, M['walnut'])
        w.mold(a, b, [(0, F1 + 0.26), (0.045, F1 + 0.26), (0.05, F1 + 0.28), (0.03, F1 + 0.3), (0, F1 + 0.3)], M['walnut'])
    for r in subtract(0, L, F1 + 0.3, F1 + 1.86, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.018, M['wainscot'])
    for a, b in runs_at(L, holes, F1 + 1.0):
        n = max(1, round((b - a) / 0.9))
        pw = (b - a - (n + 1) * 0.12) / n
        if pw > 0.15:
            for i in range(n):
                u0 = a + 0.12 + i * (pw + 0.12)
                w.box(u0, u0 + pw, F1 + 0.42, F1 + 1.74, 0.018, 0.036, M['wainscot'], bevel=0.012)
    for a, b in runs_at(L, holes, F1 + 1.93):
        w.mold(a, b, [(0, F1 + 1.86), (0.035, F1 + 1.86), (0.05, F1 + 1.89), (0.062, F1 + 1.93), (0.05, F1 + 1.97), (0.03, F1 + 2.0), (0, F1 + 2.0)], M['walnut'])
    for r in subtract(0, L, F1 + 2.0, 6.2, holes):
        w.box(r[0], r[1], r[2], r[3], 0, 0.012, M['wallpaper'])
    w.box(0, L, 6.2, 6.26, 0, 0.035, M['walnut'])
    w.box(0, L, 6.26, 6.55, 0, 0.012, M['plaster'])
    w.mold(0, L, CORNICE, M['plaster'])
    w.mold(0, L, [(0.05, 6.632), (0.078, 6.632), (0.078, 6.662), (0.05, 6.662)], M['gilt'])

def door_surround(w, uc, dw, dh):
    """A moulded architrave on plinth blocks, a frieze and cornice, and a pediment with a gilt rosette, round a door
    opening dw wide and dh high (the site draws the door itself)."""
    a, b, top = uc - dw / 2, uc + dw / 2, F1 + dh
    for u0, u1 in ((a - 0.18, a), (b, b + 0.18)):
        w.box(u0, u1, F1 + 0.36, top + 0.18, 0, 0.045, M['walnut'])
        w.box(u0 + 0.04, u1 - 0.04, F1 + 0.36, top + 0.14, 0.045, 0.06, M['walnut'])
        w.box(u0 - 0.02, u1 + 0.02, F1, F1 + 0.38, 0, 0.07, M['walnut'], bevel=0.01)
    w.box(a - 0.18, b + 0.18, top, top + 0.18, 0, 0.045, M['walnut'])
    for u0, u1, v0, v1 in ((a - 0.025, a, F1 + 0.36, top), (b, b + 0.025, F1 + 0.36, top), (a - 0.025, b + 0.025, top, top + 0.025)):
        w.box(u0, u1, v0, v1, 0, 0.07, M['gilt'])            # a gilt bead round the opening
    w.box(a - 0.2, b + 0.2, top + 0.18, top + 0.42, 0, 0.05, M['walnut'])
    w.mold(a - 0.3, b + 0.3, [(0, top + 0.42), (0.07, top + 0.42), (0.1, top + 0.46), (0.13, top + 0.5), (0.13, top + 0.54), (0, top + 0.54)], M['walnut'])
    prism([w.p(a - 0.28, top + 0.54, 0), w.p(b + 0.28, top + 0.54, 0), w.p(uc, top + 0.98, 0)], tuple(c * 0.09 for c in w.n), M['walnut'])
    rod(w.p(uc, top + 0.68, 0.09), w.p(uc, top + 0.68, 0.11), 0.075, M['gilt'], seg=14)
    rod(w.p(uc, top + 0.68, 0.11), w.p(uc, top + 0.68, 0.125), 0.035, M['gilt'], seg=10)

def sconce(w, u, v):
    """A brass sconce: an oval back plate, a scrolled arm, a drip pan and a candle."""
    rod(w.p(u, v, 0.0), w.p(u, v, 0.02), 0.085, M['brass'], seg=14)
    rod(w.p(u, v - 0.13, 0.0), w.p(u, v - 0.13, 0.018), 0.05, M['brass'], seg=10)
    pts = [w.p(u, v, 0.02), w.p(u, v - 0.07, 0.1), w.p(u, v - 0.05, 0.2), w.p(u, v + 0.02, 0.27), w.p(u, v + 0.07, 0.29)]
    for p0, p1 in zip(pts, pts[1:]):
        rod(p0, p1, 0.016, M['brass'], seg=6)
    x, y, z = w.p(u, v + 0.07, 0.29)
    lathe([(0, 0), (0.075, 0.0), (0.08, 0.02), (0.03, 0.03), (0.024, 0.07), (0, 0.07)], x, y, z, M['brass'], seg=14)
    cyl(0.024, 0.022, 0.2, x, y + 0.07, z, M['wax'], seg=10)
    flame(x, y + 0.31, z)

# the back wall (melts with the back facade): the arch to the corridor, a door, two sconces
BACK = Wall((XL, 0, ZB), (1, 0, 0), (0, 0, 1), XR - XL)
LEFT = Wall((XL, 0, ZB), (0, 0, 1), (1, 0, 0), ZF - ZB)
RIGHT = Wall((XR, 0, ZB), (0, 0, 1), (-1, 0, 0), ZF - ZB)
AR, AY = 1.4, F1 + 3.0                                 # the arch's radius and springing (its crown is the opening's top)
DOORS = {'back3': (BACK, 3.0 - XL, 1.4, 3.2), 'left1': (LEFT, -2.9 - ZB, 1.4, 3.2), 'left2': (LEFT, 0.1 - ZB, 1.3, 3.0)}
TRACK = (2.25 - ZB, ZF - ZB, F1, 4.75)                 # the ride's doorway through each partition, with its casing
group('back')
arch_u = (-AR - XL, AR - XL)
dress(BACK, [(arch_u[0], arch_u[1], F1, F1 + 4.4), (DOORS['back3'][1] - 0.7, DOORS['back3'][1] + 0.7, F1, F1 + 3.2)])
door_surround(*DOORS['back3'])
for x in (-1.95, 1.95):
    sconce(BACK, x - XL, 4.2)
# the arch: spandrels make the square opening round-headed; an archivolt, a keystone and pilasters frame it
arc = [(AR * math.cos(t), AY + AR * math.sin(t)) for t in (math.pi * k / 24 for k in range(25))]   # its crown is the opening's top
for pts in ([arc[0], (AR, F1 + 4.4)] + arc[12:0:-1], arc[24:11:-1] + [(-AR, F1 + 4.4)]):
    slab2d(pts, ZB - 0.42, ZB, M['plaster'], plane='xy')                  # plaster through the wall
    slab2d(pts, ZB, ZB + 0.012, M['wallpaper'], plane='xy')               # papered on the room side
def arc_band(cx, cy, z0, z1, r0, r1, a0, a1, m, n=24):
    """The ring between radii r0 and r1 round (cx, cy), from angle a0 to a1, between z0 and z1."""
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(V(cx + r * c, cy + r * s, z)) for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0, z1))])
    for ra, rb in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((ra[k], ra[(k + 1) % 4], rb[(k + 1) % 4], rb[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return kit.finish(bm, m, 'arc')
arc_band(0, AY, ZB, ZB + 0.06, AR, AR + 0.2, 0, math.pi, M['gilt'])
arc_band(0, AY, ZB, ZB + 0.09, AR + 0.2, AR + 0.26, 0, math.pi, M['walnut'])
prism([(-0.13, F1 + 4.25, ZB), (0.13, F1 + 4.25, ZB), (0.19, F1 + 4.72, ZB), (-0.19, F1 + 4.72, ZB)], (0, 0, 0.13), M['gilt'])
for sx in (-1, 1):
    x0, x1 = sorted((sx * AR, sx * (AR + 0.26)))
    box(x0, x1, F1, AY - 0.12, ZB, ZB + 0.07, M['walnut'])                 # pilaster
    box(x0 + 0.04, x1 - 0.04, F1 + 0.4, AY - 0.3, ZB + 0.07, ZB + 0.085, M['gilt'])   # its gilt fillet
    box(x0 - 0.03, x1 + 0.03, F1, F1 + 0.36, ZB, ZB + 0.1, M['walnut'], bevel=0.01)  # base
    box(x0 - 0.04, x1 + 0.04, AY - 0.12, AY, ZB, ZB + 0.12, M['gilt'], bevel=0.01)   # capital

# the partitions (stay put): two doors and a sconce on the left, a gilt mirror on the right, the ride's doorways
group('main')
dress(LEFT, [TRACK] + [(DOORS[k][1] - DOORS[k][2] / 2, DOORS[k][1] + DOORS[k][2] / 2, F1, F1 + DOORS[k][3]) for k in ('left1', 'left2')])
door_surround(*DOORS['left1'])
door_surround(*DOORS['left2'])
sconce(LEFT, 1.6 - ZB, 4.2)
dress(RIGHT, [TRACK])
sconce(RIGHT, 1.6 - ZB, 4.2)
mu = -1.0 - ZB                                          # the mirror
RIGHT.box(mu - 0.56, mu + 0.56, 3.05, 5.55, 0.03, 0.04, M['mirror'])
for u0, u1, v0, v1 in ((mu - 0.68, mu - 0.56, 2.95, 5.67), (mu + 0.56, mu + 0.68, 2.95, 5.67), (mu - 0.68, mu + 0.68, 2.95, 3.05), (mu - 0.68, mu + 0.68, 5.55, 5.67)):
    RIGHT.box(u0, u1, v0, v1, 0, 0.07, M['gilt'], bevel=0.015)
prism([RIGHT.p(mu - 0.5, 5.67, 0), RIGHT.p(mu + 0.5, 5.67, 0), RIGHT.p(mu + 0.2, 5.95, 0), RIGHT.p(mu, 6.05, 0), RIGHT.p(mu - 0.2, 5.95, 0)],
      tuple(c * 0.06 for c in RIGHT.n), M['gilt'])

# ------------------------------------------------------------------ floor: a checker field in a dark marble border, the rug
box(XL, XR, 0.42, F1 - 0.004, ZB, ZF, M['marble_dark'])
box(XL + 0.4, XR - 0.4, F1 - 0.004, F1, ZB + 0.4, ZF - 0.4, M['checker'])
for x0, x1, z0, z1 in ((XL + 0.36, XR - 0.36, ZB + 0.36, ZB + 0.4), (XL + 0.36, XR - 0.36, ZF - 0.4, ZF - 0.36), (XL + 0.36, XL + 0.4, ZB + 0.36, ZF - 0.36),
                       (XR - 0.4, XR - 0.36, ZB + 0.36, ZF - 0.36)):
    box(x0, x1, F1 - 0.004, F1 + 0.001, z0, z1, M['brass'])
box(-0.9, 0.9, F1, F1 + 0.012, -4.4, 4.4, M['rug'])

# ------------------------------------------------------------------ ceiling: plaster with a moulded border and the chandelier's rosette
box(XL, XR, CEIL, 7.0, ZB, ZF, M['ceiling'])
for x0, x1, z0, z1 in ((XL + 0.55, XR - 0.55, ZB + 0.55, ZB + 0.67), (XL + 0.55, XR - 0.55, ZF - 0.67, ZF - 0.55), (XL + 0.55, XL + 0.67, ZB + 0.55, ZF - 0.55),
                       (XR - 0.67, XR - 0.55, ZB + 0.55, ZF - 0.55)):
    box(x0, x1, CEIL - 0.05, CEIL, z0, z1, M['plaster'], bevel=0.015)
CX, CZ = 0.0, 0.6
lathe([(0, CEIL - 0.1), (0.1, CEIL - 0.095), (0.22, CEIL - 0.06), (0.3, CEIL - 0.03), (0.33, CEIL), (0, CEIL)], CX, 0, CZ, M['plaster'], seg=24)

# ------------------------------------------------------------------ the chandelier: chain, baluster, eight scrolled arms and crystal drops
y = CEIL - 0.1
for i in range(13):                                    # chain links, alternately turned
    with kit.frame((CX, y - 0.035, CZ), ry=(i % 2) * math.pi / 2):
        torus(0.03, 0.007, M['brass'], seg=10, ring=5)
    y -= 0.06
lathe([(0, 5.42), (0.05, 5.43), (0.17, 5.5), (0.21, 5.57), (0.13, 5.61), (0.08, 5.64), (0.06, 5.72), (0.1, 5.79), (0.06, 5.86), (0.04, 5.95), (0.06, 6.0), (0.035, y), (0, y)],
      CX, 0, CZ, M['gilt'], seg=16)
sphere(0.035, CX, 5.4, CZ, M['gilt'], seg=8)
for i in range(8):
    a = math.tau * i / 8
    ca, sa = math.cos(a), math.sin(a)
    pts = [(CX + r * ca, h, CZ + r * sa) for r, h in ((0.16, 5.55), (0.36, 5.47), (0.56, 5.49), (0.72, 5.57), (0.8, 5.68))]
    for p0, p1 in zip(pts, pts[1:]):
        rod(p0, p1, 0.017, M['gilt'], seg=6)
    x, z = CX + 0.8 * ca, CZ + 0.8 * sa
    lathe([(0, 0), (0.075, 0.0), (0.08, 0.02), (0.03, 0.03), (0, 0.03)], x, 5.68, z, M['gilt'], seg=12)
    cyl(0.028, 0.026, 0.2, x, 5.71, z, M['wax'], seg=10)
    flame(x, 5.94, z)
    dx, dz = CX + 0.45 * ca, CZ + 0.45 * sa            # a crystal drop from each arm
    rod((dx, 5.47, dz), (dx, 5.4, dz), 0.004, M['brass'], seg=4)
    cyl(0.0, 0.03, 0.05, dx, 5.35, dz, M['crystal'], seg=6)
    cyl(0.03, 0.0, 0.09, dx, 5.26, dz, M['crystal'], seg=6)

# ------------------------------------------------------------------ the clock with thirteen hours: its case (the site draws the dial, hands and pendulum)
with kit.frame((-3.0, F1, -4.32)):
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(sx * 0.42 - 0.06, sx * 0.42 + 0.06, 0, 0.1, sz * 0.21 - 0.05, sz * 0.21 + 0.05, M['walnut'], bevel=0.02)
    box(-0.46, 0.46, 0.08, 0.5, -0.25, 0.25, M['walnut'], bevel=0.015)
    box(-0.4, 0.4, 0.14, 0.44, 0.25, 0.27, M['walnut'], bevel=0.01)      # a raised panel on the plinth
    box(-0.5, 0.5, 0.5, 0.58, -0.26, 0.29, M['walnut'], bevel=0.02)
    box(-0.34, 0.34, 0.58, 2.24, -0.24, 0.2, M['walnut'])
    for x0, x1, v0, v1 in ((-0.25, -0.2, 0.86, 2.14), (0.2, 0.25, 0.86, 2.14), (-0.25, 0.25, 0.86, 0.9), (-0.25, 0.25, 2.1, 2.14)):
        box(x0, x1, v0, v1, 0.2, 0.225, M['gilt'])    # round the pendulum's window
    for sx in (-1, 1):
        cyl(0.03, 0.03, 1.6, sx * 0.3, 0.62, 0.17, M['walnut'], seg=8)      # quarter columns on the trunk
    box(-0.44, 0.44, 2.24, 2.36, -0.25, 0.27, M['walnut'], bevel=0.02)
    box(-0.46, 0.46, 2.36, 3.22, -0.24, 0.26, M['walnut'])
    for sx in (-1, 1):
        cyl(0.04, 0.035, 0.78, sx * 0.43, 2.4, 0.25, M['walnut'], seg=10)
        box(sx * 0.43 - 0.055, sx * 0.43 + 0.055, 3.12, 3.2, 0.19, 0.31, M['gilt'])
        box(sx * 0.43 - 0.055, sx * 0.43 + 0.055, 2.36, 2.42, 0.19, 0.31, M['gilt'])
    box(-0.52, 0.52, 3.22, 3.32, -0.27, 0.32, M['walnut'], bevel=0.02)
    slab2d([(0.46 * math.cos(t), 3.32 + 0.3 * math.sin(t)) for t in (math.pi * k / 16 for k in range(17))], -0.24, 0.24, M['walnut'])
    for x in (-0.42, 0.0, 0.42):                       # gilt finials
        cyl(0.05, 0.04, 0.06, x, 3.32 + (0.31 if x == 0 else 0.0), 0.0, M['gilt'], seg=10)
        sphere(0.045, x, 3.43 + (0.31 if x == 0 else 0.0), 0.0, M['gilt'], seg=10)
        cyl(0.02, 0.0, 0.08, x, 3.47 + (0.31 if x == 0 else 0.0), 0.0, M['gilt'], seg=8)

# ------------------------------------------------------------------ the corridor, in forced perspective
# Modelled as a straight corridor 2.8 wide and 4.4 high running back C = 0..LC (the wall's thickness before it, back to
# C = -0.3), then squeezed into the 2.9 the house has behind its back wall: at depth C everything shrinks about the
# floor's centre line by s(C), to 0.236 at the far end, as js/house.js tapered the corridor it replaces.
LC, ZC0, ZC1, SEND = 16.0, -5.0, -7.9, 0.66 / 2.8
def s_at(c):
    return 1.0 if c <= 0 else 1.0 - (1.0 - SEND) * c / LC
def warp(x, y, z):
    """A point of the straight corridor (z = -C) where the house has it."""
    c = -z
    zz = ZC0 + (ZC1 - ZC0) * c / LC if c >= 0 else ZC0 + (-c) * ((ZB - ZC0) / 0.4)
    s = s_at(c)
    return x * s, F1 + (y - F1) * s, zz
class tapered:
    """Parts made inside are modelled straight and squeezed by warp()."""
    def __enter__(self):
        self.start = len(kit.OBJS)
    def __exit__(self, *exc):
        for ob in kit.OBJS[self.start:]:
            for v in ob.data.vertices:
                x, y, z = warp(v.co.x, v.co.z, -v.co.y)
                v.co = V(x, y, z)
            ob.data.update()
CW, CH = 1.4, 4.4                                      # its half-width and height, straight
PORTALS = [0.9 + 1.8 * i for i in range(9)]
with tapered():
    for c0 in [-0.4 + 0.4 * k for k in range(42)]:     # in short lengths, so the squeeze stays smooth
        c1 = c0 + 0.4
        box(-CW - 0.15, CW + 0.15, F1 - 0.12, F1, -c1, -c0, M['c_floor'])
        box(-0.72, 0.72, F1, F1 + 0.01, -c1, -c0, M['c_runner'])
        for sx in (-1, 1):
            x0 = sx * CW
            box(x0, x0 + sx * 0.15, F1, F1 + CH + 0.15, -c1, -c0, M['stone_dark'])           # wall core
            box(x0, x0 - sx * 0.035, F1, F1 + 0.25, -c1, -c0, M['walnut'])                    # baseboard
            box(x0, x0 - sx * 0.015, F1 + 0.25, F1 + 1.55, -c1, -c0, M['c_wainscot'])
            box(x0, x0 - sx * 0.055, F1 + 1.55, F1 + 1.67, -c1, -c0, M['walnut'])             # chair rail
            box(x0, x0 - sx * 0.01, F1 + 1.67, F1 + 3.85, -c1, -c0, M['c_paper'])
            box(x0, x0 - sx * 0.05, F1 + 3.85, F1 + 3.95, -c1, -c0, M['walnut'])
            box(x0, x0 - sx * 0.12, F1 + 3.95, F1 + CH, -c1, -c0, M['plaster'])
        box(-CW - 0.15, CW + 0.15, F1 + CH, F1 + CH + 0.15, -c1, -c0, M['walnut'])                # ceiling
    for i, c in enumerate(PORTALS):                    # gilded arches, one after another into the distance
        r = 1.16
        for sx in (-1, 1):
            x0, x1 = sorted((sx * CW, sx * (CW - 0.2)))
            box(x0, x1, F1, F1 + 3.2, -c - 0.1, -c + 0.1, M['gilt'])
            box(x0 - 0.02, x1 + 0.02, F1, F1 + 0.3, -c - 0.12, -c + 0.12, M['walnut'])
            box(x0 - 0.03, x1 + 0.03, F1 + 3.12, F1 + 3.26, -c - 0.13, -c + 0.13, M['gilt'])
        half = lambda sx: [(sx * r * math.cos(t), F1 + 3.2 + r * math.sin(t)) for t in (math.pi / 2 * k / 8 for k in range(9))]
        for sx in (-1, 1):
            pts = [(sx * CW, F1 + 3.2)] + [(sx * r, F1 + 3.2)] + half(sx)[1:] + [(0, F1 + CH), (sx * CW, F1 + CH)]
            slab2d(pts, -c - 0.1, -c + 0.1, M['walnut'], plane='xy')
        arc_band(0, F1 + 3.2, -c - 0.11, -c + 0.11, r - 0.02, r + 0.07, 0, math.pi, M['gilt'], n=18)
        if i % 2 == 0 and i < 8:                       # a sconce on each wall, midway to the next arch
            cm = c + 0.9
            for sx in (-1, 1):
                x0 = sx * (CW - 0.01)
                box(x0, x0 - sx * 0.02, F1 + 2.3, F1 + 2.6, -cm - 0.07, -cm + 0.07, M['brass'])
                rod((x0 - sx * 0.02, F1 + 2.45, -cm), (x0 - sx * 0.2, F1 + 2.55, -cm), 0.016, M['brass'], seg=6)
                cyl(0.06, 0.03, 0.04, x0 - sx * 0.2, F1 + 2.55, -cm, M['brass'], seg=10)
                cyl(0.022, 0.02, 0.18, x0 - sx * 0.2, F1 + 2.59, -cm, M['wax'], seg=8)
    box(-CW, CW, F1, F1 + CH, -LC - 0.2, -LC, M['c_paper'])        # the far end: a door that never opens
    box(-0.5, 0.5, F1, F1 + 2.3, -LC - 0.01, -LC + 0.005, M['void'])
    for x0, x1, v0, v1 in ((-0.62, -0.5, F1, F1 + 2.42), (0.5, 0.62, F1, F1 + 2.42), (-0.62, 0.62, F1 + 2.3, F1 + 2.42)):
        box(x0, x1, v0, v1, -LC + 0.005, -LC + 0.08, M['gilt'])
for i, c in enumerate(PORTALS):                        # the corridor's candles, at their squeezed places
    if i % 2 == 0 and i < 8:
        cm = c + 0.9
        for sx in (-1, 1):
            x, y, z = warp(sx * (CW - 0.21), F1 + 2.83, -cm)
            flame(x, y, z, s_at(cm), power=21.0 * s_at(cm) ** 2)

# ------------------------------------------------------------------ bake-only: the walls' cores, the front wall and its windows
FRONT_OPEN = [(-3.38, -1.82, 2.0, 5.8), (1.82, 3.38, 2.0, 5.8), (-1.2, 1.2, F1, 5.7)]
for r in subtract(XL, XR, F1, CEIL, [(a, b, c, d) for a, b, c, d in FRONT_OPEN]):
    blocker(box(r[0], r[1], r[2], r[3], ZF, ZF + 0.4, M['walnut']))
blocker(box(-1.2, 1.2, F1, 5.0, ZF + 0.25, ZF + 0.35, M['walnut']))   # the front doors (the fanlight above them stays open)
for r in subtract(XL, XR, F1, CEIL, [(-AR, AR, F1, F1 + 4.4)]):
    blocker(box(r[0], r[1], r[2], r[3], ZB - 0.4, ZB, M['walnut']))
for x0 in (XL - 0.4, XR):
    for r in subtract(ZB, ZF, F1, CEIL, [(2.25, ZF, F1, 4.75)]):
        blocker(box(x0, x0 + 0.4, r[2], r[3], r[0], r[1], M['walnut']))

# ------------------------------------------------------------------ lights
light('chandelier_glow', 'POINT', (CX, 5.2, CZ), WARM, 900, size=0.6)    # the candles' halo, as the site's room light does
for x0, x1, v0, v1 in FRONT_OPEN[:2]:
    light('moon_window', 'AREA', ((x0 + x1) / 2, (v0 + v1) / 2, ZF + 0.1), MOON, 250, size=(x1 - x0) * 0.9, size_y=(v1 - v0) * 0.9, aim=(0, -0.25, -1), group='cool')
light('moon_fanlight', 'AREA', (0, 5.35, ZF + 0.1), MOON, 60, size=2.2, size_y=0.6, aim=(0, -0.3, -1), group='cool')

kit.build('endless', 'End', A['out'], A['size'], A['cool_size'], A['samples'],
          ambient=lambda nrm, ao: ao * np.array([0.08, 0.07, 0.12], np.float32),     # the house's dim, cool ambient
          hidden=lambda n, c: c[2] > ZF - 0.01 and n[2] > 0.5 and c[1] < F1)   # the floor's cut edge, under the house's trim
