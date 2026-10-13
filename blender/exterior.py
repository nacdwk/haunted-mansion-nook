"""Build, light-bake and export the mansion's exterior shell: the four facades with their windows, doors and
corner pilasters, the columned portico and balcony, the porch and steps, the mansard and its dormers, and the
roof that floats up when the house opens (deck, chimneys and cupola).

    blender -b --factory-startup -P blender/exterior.py -- --out blender/build --size 2048 --samples 256

Writes exterior.glb (objects Ext_<group>: porch, front, back, left, right, mansard-front/back/left/right,
roof, and the tower's tower-base, tower0..7 (one per wall of the Stretching Room), tower-upper and the
live-lit tower-iron), exterior_warm.png and exterior_cool.png (sqrt-encoded irradiance) and exterior.json.

warm: the shelf candle beside the house, the glowing windows, the gas lamps and the cupola.
cool: the moon, the pink fill light and the night sky, matching js/main.js.

The window panes, iron railings and cresting, weathervane and the ghosts stay procedural, and so does
everything on the room side of the walls. Coordinates match js/house.js.
The trees are baked with the grounds (grounds.py); here the spiral tree beside the house and the small one
behind it are only bake-only scenery, so they shadow the walls where the site's trees stand. The lights are
saved to exterior_lights.json, so the grounds are lit the same way.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
from mathutils import Vector
import kit
import trees
from kit import M, mat, box, cyl, lathe, sphere, prism, slab, slab2d, rod, torus, Wall, subtract, runs_at, group, light, blocker, hexcol

A = kit.args({'out': 'assets', 'size': 2048, 'cool_size': 2048, 'samples': 256})
kit.reset_scene(A['samples'])

X0, X1, Z0, Z1 = -14.0, 14.0, -5.0, 5.0
F1, F2, AT, TOP = 0.8, 7.4, 14.0, 19.4
SKIN = 0.16                        # the facades' outer layer in js/house.js; the room side stays procedural
for name, col, rough in [('siding', '#a79fb8', 0.8), ('trim', '#ebe4f0', 0.6), ('trim_dark', '#2a2236', 0.7), ('shutter', '#2c2b45', 0.7),
                         ('brick', '#6a3a3a', 0.9), ('stone', '#8a7f78', 0.9), ('stone_dark', '#4f4a5e', 0.85), ('shingle', '#4d3b63', 0.75),
                         ('shingle_dark', '#2e2540', 0.75), ('iron', '#17131d', 0.5), ('gold', '#c9a24a', 0.4), ('door', '#4a1e14', 0.5),
                         ('wood_dark', '#3a2214', 0.8), ('bark', '#2b2129', 0.9)]:
    mat(name, col, rough)
T = M['trim']
WARM_WINDOW = hexcol('#ffc27a')

# ------------------------------------------------------------------ facades (openings as in js/house.js)
def win(u, v0, v1):
    return (u - 0.78, u + 0.78, v0, v1, 'win')
FRONT_U = (2.5, 6.8, 11.4, 16.6, 21.2, 25.5)
FACADES = {
    'front': (Wall((X0, 0, Z1), (1, 0, 0), (0, 0, 1), 28.0),
              [win(u, 2.0, 5.8) for u in FRONT_U] + [win(u, 8.6, 12.4) for u in FRONT_U]
              + [(12.8, 15.2, F1, 5.7, 'door'), (13.0, 15.0, F2, 12.4, 'door2')]),
    'back': (Wall((X1, 0, Z0), (-1, 0, 0), (0, 0, -1), 28.0),
             [(1.0, 8.6, 1.4, 6.6, 'glass'), (12.6, 15.4, F1, 5.2, 'arch'), (3.9, 5.5, 9.4, 11.8, 'win')]),
    'left': (Wall((X0, 0, Z0), (0, 0, 1), (-1, 0, 0), 10.0), [(1.2, 2.6, 9.0, 12.2, 'win')]),
    'right': (Wall((X1, 0, Z1), (0, 0, -1), (1, 0, 0), 10.0),
              [(0.3, 2.6, F1, 4.4, 'track'), (5.3, 6.7, 2.0, 5.8, 'win'), (7.25, 9.65, F2, 11.0, 'track'), (2.8, 4.2, 8.6, 12.4, 'win')]),
}

def shutter(w, a, b, v0, v1):
    S = M['shutter']
    w.box(a, a + 0.07, v0, v1, 0.02, 0.09, S)
    w.box(b - 0.07, b, v0, v1, 0.02, 0.09, S)
    w.box(a + 0.07, b - 0.07, v0, v0 + 0.1, 0.02, 0.09, S)
    w.box(a + 0.07, b - 0.07, v1 - 0.1, v1, 0.02, 0.09, S)
    vm = (v0 + v1) / 2
    w.box(a + 0.07, b - 0.07, vm - 0.05, vm + 0.05, 0.02, 0.09, S)
    w.box(a + 0.07, b - 0.07, v0 + 0.1, v1 - 0.1, 0.02, 0.035, S)
    v = v0 + 0.13
    while v < v1 - 0.16:
        if abs(v + 0.04 - vm) > 0.09:          # slanted louvres
            w.mold(a + 0.07, b - 0.07, [(0.035, v), (0.085, v + 0.05), (0.085, v + 0.085), (0.035, v + 0.035)], S)
        v += 0.12

def casing(w, u0, u1, v0, v1, ears=0.05):
    w.box(u0 - 0.18, u0, v0 - ears, v1 + 0.18, 0, 0.07, T)
    w.box(u1, u1 + 0.18, v0 - ears, v1 + 0.18, 0, 0.07, T)
    w.box(u0, u1, v1, v1 + 0.18, 0, 0.07, T)

def pediment(w, u0, u1, v):
    """Triangular pediment whose base cornice sits at v."""
    c = (u0 + u1) / 2
    w.box(u0 - 0.42, u1 + 0.42, v, v + 0.09, 0, 0.18, T)
    prism([w.p(u0 - 0.34, v + 0.09, 0), w.p(u1 + 0.34, v + 0.09, 0), w.p(c, v + 0.44, 0)], tuple(x * 0.09 for x in w.n), T)
    for s in (-1, 1):                          # raking cornices
        e0 = u0 - 0.46 if s < 0 else u1 + 0.46
        prism([w.p(e0, v + 0.05, 0), w.p(c, v + 0.5, 0), w.p(c, v + 0.59, 0), w.p(e0, v + 0.14, 0)], tuple(x * 0.17 for x in w.n), T)

def window(w, h, holes, upper):
    u0, u1, v0, v1, kind = h
    c = (u0 + u1) / 2
    casing(w, u0, u1, v0, v1)
    if upper:
        pediment(w, u0, u1, v1 + 0.18)
    else:                                      # flat cornice head with a keystone
        w.box(u0 - 0.26, u1 + 0.26, v1 + 0.18, v1 + 0.34, 0, 0.09, T)
        w.mold(u0 - 0.36, u1 + 0.36, [(0, v1 + 0.34), (0.2, v1 + 0.34), (0.23, v1 + 0.4), (0.21, v1 + 0.46), (0, v1 + 0.47)], T)
        w.box(c - 0.12, c + 0.12, v1 - 0.1, v1 + 0.34, 0, 0.12, T)
    w.mold(u0 - 0.26, u1 + 0.26, [(0, v0 - 0.12), (0.2, v0 - 0.12), (0.23, v0 - 0.06), (0.21, v0), (0, v0 + 0.02)], T)   # sill
    for uu in (u0 + 0.04, u1 - 0.16):          # sill brackets
        w.mold(uu, uu + 0.12, [(0, v0 - 0.42), (0.04, v0 - 0.42), (0.14, v0 - 0.22), (0.16, v0 - 0.12), (0, v0 - 0.12)], T)
    if not upper:                              # panelled apron under the ground-floor windows
        w.box(u0 + 0.02, u1 - 0.02, v0 - 0.62, v0 - 0.14, 0, 0.03, T)
    for (a, b) in [(u0 - 0.2 - 0.78, u0 - 0.2), (u1 + 0.2, u1 + 0.2 + 0.78)]:
        if any(o is not h and o[0] - 0.35 < b and o[1] + 0.35 > a and o[2] < v1 and o[3] > v0 for o in holes):
            continue                           # no room beside the doors
        if a < 0.5 or b > w.length - 0.5:
            continue                           # or against a corner pilaster
        shutter(w, a, b, v0, v1)

def front_door(w, h):
    u0, u1, v0, v1, _ = h
    for (a, b) in [(u0 - 0.44, u0 - 0.04), (u1 + 0.04, u1 + 0.44)]:     # pilasters
        w.box(a, b, v0, v1, 0, 0.12, T)
        w.box(a - 0.04, b + 0.04, v0, v0 + 0.42, 0, 0.16, T, bevel=0.02)
        w.box(a - 0.05, b + 0.05, v1 - 0.22, v1, 0, 0.17, T, bevel=0.02)
        for k in (-0.1, 0.0, 0.1):
            w.box((a + b) / 2 + k - 0.02, (a + b) / 2 + k + 0.02, v0 + 0.5, v1 - 0.3, 0.12, 0.14, T)
    w.box(u0 - 0.52, u1 + 0.52, v1, v1 + 0.34, 0, 0.14, T)
    w.mold(u0 - 0.62, u1 + 0.62, [(0, v1 + 0.34), (0.26, v1 + 0.34), (0.29, v1 + 0.4), (0.26, v1 + 0.48), (0, v1 + 0.5)], T)
    w.box(u0, u1, 5.0, 5.08, -0.16, -0.02, T)                           # transom bar under the fanlight
    c = (u0 + u1) / 2
    for k in range(5):                                                  # sunburst muntins over the fanlight
        a = math.pi * (k + 1) / 6
        uu, vv = c + math.cos(a) * 0.62, 5.08 + math.sin(a) * 0.58
        prism([w.p(c - 0.02, 5.08, -0.1), w.p(c + 0.02, 5.08, -0.1), w.p(uu + 0.02, vv, -0.1), w.p(uu - 0.02, vv, -0.1)], tuple(x * 0.04 for x in w.n), T)
    D = M['door']
    for (a, b) in [(u0, c - 0.01), (c + 0.01, u1)]:                     # the two leaves, panelled
        w.box(a, b, v0, 5.0, -0.15, -0.08, D)
        for (pv0, pv1) in [(v0 + 0.25, v0 + 1.45), (v0 + 1.65, v0 + 2.95), (v0 + 3.15, 4.8)]:
            w.box(a + 0.16, b - 0.16, pv0, pv1, -0.08, -0.05, D, bevel=0.03)
        knob = w.p(b - 0.16 if a < c else a + 0.16, v0 + 2.2, -0.03)
        sphere(0.06, *knob, M['gold'], seg=8)

def balcony_door(w, h):
    u0, u1, v0, v1, _ = h
    casing(w, u0, u1, v0, v1, ears=0.0)
    pediment(w, u0, u1, v1 + 0.18)
    c = (u0 + u1) / 2
    w.box(c - 0.04, c + 0.04, v0, v1, -0.11, -0.05, T)                 # meeting stiles
    for vv in (v0 + 1.25, v0 + 2.5, v0 + 3.75):                         # glazing bars
        w.box(u0, u1, vv - 0.03, vv + 0.03, -0.11, -0.06, T)

def archway(w, h):
    u0, u1, v0, v1, _ = h
    w.box(u0 - 0.22, u0, v0, v1 + 0.22, 0, 0.14, T)
    w.box(u1, u1 + 0.22, v0, v1 + 0.22, 0, 0.14, T)
    w.box(u0 - 0.36, u1 + 0.36, v1, v1 + 0.36, 0, 0.18, T)
    w.box((u0 + u1) / 2 - 0.16, (u0 + u1) / 2 + 0.16, v1 - 0.05, v1 + 0.42, 0, 0.22, T)

for side, (w, holes) in FACADES.items():
    group(side, lowres=(side == 'back'))
    L = w.length
    for (a, b, c, d) in subtract(0, L, F1, AT, [h for h in holes]):
        w.box(a, b, c, d, -SKIN, 0, M['siding'])
    for h in holes:                                                     # jambs lining each opening
        u0, u1, v0, v1, kind = h
        w.box(u0, u0 + 0.05, v0, v1, -SKIN, 0, T)
        w.box(u1 - 0.05, u1, v0, v1, -SKIN, 0, T)
        w.box(u0, u1, v1 - 0.05, v1, -SKIN, 0, T)
    w.box(-0.14, L + 0.14, 0.0, F1, -SKIN, 0.08, M['brick'])            # brick foundation and its water table
    w.mold(-0.16, L + 0.16, [(0, F1 - 0.06), (0.12, F1 - 0.06), (0.15, F1 - 0.02), (0.11, F1 + 0.04), (0, F1 + 0.07)], M['stone'])
    for (a, b) in [(-0.05, 0.45), (L - 0.45, L + 0.05)]:                # corner pilasters
        w.box(a, b, F1, AT - 0.75, 0, 0.14, T)
        w.box(a - 0.05, b + 0.05, F1, F1 + 0.45, 0, 0.18, T, bevel=0.02)
        w.box(a - 0.06, b + 0.06, AT - 1.0, AT - 0.78, 0, 0.2, T, bevel=0.02)
    for a, b in runs_at(L, holes, 7.25):                                # belt course between the floors
        a, b = (a - 0.14 if a < 0.01 else a), (b + 0.14 if b > L - 0.01 else b)
        w.mold(a, b, [(0, 7.06), (0.1, 7.06), (0.14, 7.12), (0.14, 7.36), (0.1, 7.42), (0, 7.44)], T)
    w.box(0, L, AT - 0.78, AT - 0.38, 0, 0.05, T)                       # frieze
    u = 0.6
    while u < L - 0.3:                                                   # scrolled brackets under the cornice
        w.mold(u - 0.1, u + 0.1, [(0, 13.18), (0.05, 13.18), (0.07, 13.26), (0.1, 13.38), (0.15, 13.48), (0.22, 13.56), (0.28, 13.6), (0.28, 13.62), (0, 13.62)], T)
        u += 1.1
    w.mold(-0.46, L + 0.46, [(0, 13.62), (0.3, 13.62), (0.32, 13.66), (0.36, 13.74), (0.42, 13.86), (0.46, 13.96), (0.46, 14.05), (0, 14.05)], T)
    for h in holes:
        kind = h[4]
        if kind == 'win':
            window(w, h, holes, h[2] > F2 - 0.1)
        elif kind == 'door':
            front_door(w, h)
        elif kind == 'door2':
            balcony_door(w, h)
        elif kind in ('track', 'arch'):
            archway(w, h)
        elif kind == 'glass':
            casing(w, h[0], h[1], h[2], h[3])
            w.mold(h[0] - 0.26, h[1] + 0.26, [(0, h[2] - 0.12), (0.2, h[2] - 0.12), (0.23, h[2] - 0.06), (0.21, h[2]), (0, h[2] + 0.02)], T)

# ------------------------------------------------------------------ the portico: columns, entablature, balcony (front facade)
group('front')
CZ = 7.08
for x in (-7.0, -4.3, -1.6, 1.6, 4.3, 7.0):
    box(x - 0.48, x + 0.48, F1, F1 + 0.36, CZ - 0.48, CZ + 0.48, T, bevel=0.03)
    lathe([(0, F1 + 0.36), (0.47, F1 + 0.36), (0.47, F1 + 0.42), (0.43, F1 + 0.48), (0.445, F1 + 0.53), (0.41, F1 + 0.59), (0.39, F1 + 0.63),
           (0.392, 4.0), (0.385, 7.0), (0.365, 10.0), (0.335, 12.9),
           (0.37, 12.93), (0.37, 13.0), (0.335, 13.03), (0.36, 13.13), (0.42, 13.3), (0.46, 13.36), (0, 13.36)], x, 0, CZ, T, seg=24)
    box(x - 0.52, x + 0.52, 13.36, 13.55, CZ - 0.52, CZ + 0.52, T, bevel=0.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            sphere(0.075, x + sx * 0.42, 13.27, CZ + sz * 0.42, T, seg=8)
box(-7.7, 7.7, 13.55, 13.88, CZ - 0.5, CZ + 0.5, T)              # architrave over the columns
box(-7.7, 7.7, 13.55, 14.5, Z1, CZ - 0.5, T)                      # the portico's roof structure, back to the wall
box(-7.75, 7.75, 13.88, 14.28, CZ - 0.5, CZ + 0.55, T)            # frieze
x = -7.4
while x <= 7.45:                                                  # modillions
    box(x - 0.09, x + 0.09, 14.2, 14.3, CZ + 0.55, CZ + 0.8, T)
    x += 0.6
CR = [(0.0, 14.28), (0.3, 14.28), (0.34, 14.34), (0.37, 14.48), (0.42, 14.6), (0.42, 14.75), (0.0, 14.75)]   # crown, as (outward, y)
prism([(-8.0, y, CZ + 0.55 + d) for d, y in CR], (16.0, 0, 0), T)
for s in (-1, 1):
    prism([(s * (7.75 + d), y, Z1) for d, y in CR], (0, 0, CZ + 0.97 - Z1), T)
box(-7.95, 7.95, 14.62, 14.75, Z1, CZ + 0.95, T)                 # the flat roof (the iron cresting stays procedural)
box(-7.6, 7.6, 7.15, 7.45, Z1, 7.7, T)                            # balcony floor and its fascia
prism([(-7.68, y, 7.7 + d) for d, y in [(0, 7.15), (0.08, 7.15), (0.1, 7.22), (0.08, 7.45), (0, 7.47)]], (15.36, 0, 0), T)

# ------------------------------------------------------------------ porch and steps (stays put; the jack-o'-lanterns sit on these steps)
group('porch')
box(-7.7, 7.7, 0.0, 0.75, Z1, 7.75, M['stone'])
box(-7.8, 7.8, 0.75, 0.82, 4.95, 7.85, M['stone_dark'], bevel=0.015)
box(-7.6, 7.6, 0.1, 0.62, 7.75, 7.79, M['stone_dark'])
box(-2.3, 2.3, 0.0, 0.47, 7.75, 8.3, M['stone'])
box(-2.36, 2.36, 0.47, 0.53, 7.75, 8.36, M['stone_dark'], bevel=0.01)
box(-2.3, 2.3, 0.0, 0.2, 8.3, 8.8, M['stone'])
box(-2.36, 2.36, 0.2, 0.26, 8.3, 8.86, M['stone_dark'], bevel=0.01)
for s in (-1, 1):                                                 # cheek blocks with urns
    box(s * 2.36, s * 2.82, 0.0, 0.95, 7.75, 8.92, M['stone'])
    box(s * 2.3, s * 2.88, 0.95, 1.03, 7.69, 8.98, M['stone_dark'], bevel=0.015)
    lathe([(0, 0), (0.16, 0), (0.12, 0.08), (0.2, 0.22), (0.24, 0.34), (0.18, 0.46), (0.2, 0.5), (0, 0.52)], s * 2.59, 1.03, 8.33, M['stone'], seg=12)

# ------------------------------------------------------------------ mansard: four slopes (each dissolves on its own), dormers in front
B, Bz, Tx, Tz = 14.25, 5.25, 12.3, 3.3
MID = (0.0, 16.0, 0.0)
SLOPES = {
    'front': [[(-B, AT, Bz), (B, AT, Bz), (Tx, TOP, Tz), (-Tx, TOP, Tz)]],
    'back': [[(B, AT, -Bz), (-B, AT, -Bz), (-Tx, TOP, -Tz), (Tx, TOP, -Tz)]],
    'left': [[(-B, AT, -Bz), (-B, AT, Bz), (-Tx, TOP, Tz), (-Tx, TOP, -Tz)]],
}
pt = lambda t, z: (B - (B - Tx) * t, AT + (TOP - AT) * t, z)
zA, zB, tO = 1.0, 3.6, 0.52
tH = (Bz - zB) / (Bz - Tz)
SLOPES['right'] = [[pt(0, Bz), pt(0, zB), pt(tH, zB)],             # the ride's opening is between z 1.0 and 3.6
                   [pt(0, zA), pt(0, -Bz), pt(1, -Tz), pt(1, zA)],
                   [pt(tO, zB), pt(tO, zA), pt(1, zA), pt(1, Tz)]]
inner_pts = []
for side, quads in SLOPES.items():
    group('mansard-' + side, lowres=(side == 'back'))
    for q in quads:
        o = slab(q, 0.12, M['shingle'], toward=MID)
        n = (Vector(q[1]) - Vector(q[0])).cross(Vector(q[-1]) - Vector(q[0])).normalized()
        if n.dot(Vector(MID) - Vector(q[0])) < 0:
            n = -n
        inner_pts += [tuple(Vector(p) + n * 0.12) for p in q]
    if side == 'front':
        box(-Tx - 0.1, Tx + 0.1, TOP - 0.16, TOP, Tz - 0.1, Tz + 0.14, M['trim_dark'])          # top curb, seen when the roof floats
    elif side == 'back':
        box(-Tx - 0.1, Tx + 0.1, TOP - 0.16, TOP, -Tz - 0.14, -Tz + 0.1, M['trim_dark'])
    else:
        s = -1 if side == 'left' else 1
        box(s * Tx - 0.14, s * Tx + 0.14, TOP - 0.16, TOP, -Tz, Tz, M['trim_dark'])
    if side == 'right':
        p0, p1 = pt(tO, zA), pt(tO, zB)
        box(p0[0] - 0.2, p0[0] + 0.3, p0[1] - 0.15, p0[1] + 0.2, zA - 0.2, zB + 0.2, T)

def dormer(x, z=4.25):
    """Only a dormer's top stands proud of the shingles, so it stops just inside them: the rest would stand inside
    the attic, across the Doom Buggies' track. zb(y) is that cut at height y; the trim stops where it is hidden."""
    w, y0, h = 2.3, 14.6, 2.5
    k = (Bz - Tz) / (TOP - AT)
    zb = lambda y: Bz - 0.064 - k * (y - AT)
    ry, yc, yt = y0 + h, AT + (Bz - 0.064 - z) / k, 16.45
    slab2d([(z, yc), (z, ry), (zb(ry), ry)], x - w / 2, x + w / 2, M['siding'], plane='zy')
    fw = Wall((x, 0, z), (1, 0, 0), (0, 0, 1), 0)
    for (a, b) in [(-0.76, -0.6), (0.6, 0.76)]:                     # window casing (the arched pane stays procedural)
        fw.box(a, b, yt, 16.6, 0, 0.08, T)
    fw.box(-0.76, 0.76, 16.6, 16.74, 0, 0.08, T)
    for (a, b) in [(-1.12, -0.86), (0.86, 1.12)]:                   # pilasters
        fw.box(a, b, yt, 16.95, 0, 0.1, T)
        fw.box(a - 0.03, b + 0.03, 16.85, 17.0, 0, 0.13, T)
    for q in ([(x - w / 2 - 0.3, ry, z + 0.3), (x, ry + 1.2, z + 0.3), (x, ry + 1.2, zb(ry + 1.2)), (x - w / 2 - 0.3, ry, zb(ry))],
              [(x, ry + 1.2, z + 0.3), (x + w / 2 + 0.3, ry, z + 0.3), (x + w / 2 + 0.3, ry, zb(ry)), (x, ry + 1.2, zb(ry + 1.2))]):
        slab(q, 0.12, M['shingle_dark'], toward=(x, ry, z - 1.1))
    prism([(x - w / 2, ry, z), (x + w / 2, ry, z), (x, ry + 1.15, z)], (0, 0, 0.06), T)
    for s in (-1, 1):                                                # raking trim on the gable
        e = x + s * (w / 2 + 0.24)
        prism([(e, ry - 0.06, z + 0.06), (x, ry + 1.14, z + 0.06), (x, ry + 1.26, z + 0.06), (e, ry + 0.06, z + 0.06)], (0, 0, 0.18), T)
    lathe([(0, 0), (0.12, 0), (0.1, 0.1), (0.16, 0.22), (0.08, 0.36), (0.03, 0.5), (0, 0.58)], x, ry + 1.2, z + 0.24, M['gold'], seg=10)
group('mansard-front')
for x in (-8.0, 0.0, 8.0):
    dormer(x)

# ------------------------------------------------------------------ the roof that floats: deck, chimneys, cupola
group('roof')
y = TOP
box(-12.1, 12.1, y - 0.2, y - 0.06, -3.1, 3.1, M['wood_dark'])
box(-12.45, 12.45, y - 0.06, y + 0.3, -3.45, 3.45, M['shingle_dark'])
RC = [(0.0, y + 0.3), (0.12, y + 0.3), (0.16, y + 0.35), (0.18, y + 0.44), (0.18, y + 0.48), (0.0, y + 0.48)]
prism([(-12.7, yy, 3.45 + d) for d, yy in RC], (25.4, 0, 0), M['trim_dark'])
prism([(12.7, yy, -3.45 - d) for d, yy in RC], (-25.4, 0, 0), M['trim_dark'])
for s in (-1, 1):
    prism([(s * (12.45 + d), yy, -3.6) for d, yy in RC], (0, 0, 7.2), M['trim_dark'])
box(-12.45, 12.45, y + 0.3, y + 0.42, -3.45, 3.45, M['trim_dark'])
box(-12.2, 12.2, y + 0.42, y + 0.5, -3.2, 3.2, M['shingle'])
for x in (-9.4, 9.4):
    box(x - 0.75, x + 0.75, y, y + 3.3, -2.4, -0.9, M['brick'])
    box(x - 0.82, x + 0.82, y + 3.3, y + 3.45, -2.47, -0.83, M['brick'])
    box(x - 0.88, x + 0.88, y + 3.45, y + 3.6, -2.53, -0.77, M['brick'])
    box(x - 0.95, x + 0.95, y + 3.6, y + 3.85, -2.6, -0.7, M['stone_dark'], bevel=0.03)
    for (a, b) in [(-0.6, -0.5), (0.5, 0.6)]:                       # pilaster strips on the chimney face
        box(x + a, x + b, y + 0.7, y + 3.3, -0.9, -0.86, M['brick'])
    for dx in (-0.35, 0.35):
        lathe([(0, 0), (0.2, 0), (0.16, 0.4), (0.15, 0.58), (0.2, 0.64), (0.2, 0.7), (0, 0.7)], x + dx, y + 3.85, -1.65, M['brick'], seg=10)
cy0 = y + 0.5
cyl(2.25, 2.25, 0.5, 0, cy0, 0, T, seg=8, rot=math.pi / 8)
cyl(2.0, 2.0, 2.6, 0, cy0 + 0.5, 0, M['siding'], seg=8, rot=math.pi / 8)
apo = 2.0 * math.cos(math.pi / 8)
for i in range(8):                                                   # window frames around the procedural panes
    a = i / 8 * math.tau
    fw = Wall((math.sin(a) * apo, 0, math.cos(a) * apo), (math.cos(a), 0, -math.sin(a)), (math.sin(a), 0, math.cos(a)), 0)
    yc = cy0 + 1.85
    fw.obox(-0.6, -0.47, yc - 0.85, yc + 0.85, 0, 0.08, T)
    fw.obox(0.47, 0.6, yc - 0.85, yc + 0.85, 0, 0.08, T)
    fw.obox(-0.6, 0.6, yc + 0.85, yc + 0.99, 0, 0.1, T)
    fw.obox(-0.62, 0.62, yc - 0.99, yc - 0.85, 0, 0.12, T)
    b = a + math.pi / 8                                              # corner posts
    pw = Wall((math.sin(b) * 1.98, 0, math.cos(b) * 1.98), (math.cos(b), 0, -math.sin(b)), (math.sin(b), 0, math.cos(b)), 0)
    pw.obox(-0.11, 0.11, cy0 + 0.5, cy0 + 3.1, -0.11, 0.11, T)
cyl(2.35, 2.35, 0.35, 0, cy0 + 3.1, 0, T, seg=8, rot=math.pi / 8)
cyl(2.45, 2.2, 0.12, 0, cy0 + 3.45, 0, T, seg=8, rot=math.pi / 8)
lathe([(0, 0), (1.95, 0), (2.05, 0.15), (1.6, 0.7), (0.9, 1.3), (0.45, 1.8), (0.2, 2.25), (0, 2.4)], 0, cy0 + 3.57, 0, M['shingle'], seg=8, rot=math.pi / 8)
lathe([(0, 0), (0.12, 0), (0.2, 0.15), (0.2, 0.3), (0.08, 0.45), (0, 0.5)], 0, cy0 + 5.85, 0, M['gold'], seg=12)
cyl(0.06, 0.06, 1.6, 0, cy0 + 6.3, 0, M['iron'], seg=6)

# ------------------------------------------------------------------ the stretching tower's outside (js/house.js buildTower)
TWX, TWZ, TWR = -16.9, 2.0, 3.0
TAPO, TSIDE, TH0 = TWR * math.cos(math.pi / 8), 2 * TWR * math.sin(math.pi / 8) + 0.08, 6.6
SD, ST = M['stone_dark'], M['stone']
group('tower-base')                                # the foundation stays put
cyl(TWR + 0.35, TWR + 0.25, F1, TWX, 0, TWZ, ST, seg=8, rot=math.pi / 8)
cyl(TWR + 0.33, TWR + 0.33, 0.12, TWX, F1 - 0.12, TWZ, SD, seg=8, rot=math.pi / 8)
for i in range(8):                                 # the Stretching Room's walls: each melts on its own and stretches with the room
    if i == 2:
        continue                                   # (the side against the house has none)
    group(f'tower{i}')
    with kit.frame((TWX, F1, TWZ), ry=i * math.pi / 4):
        box(-TSIDE / 2, TSIDE / 2, 0.3, TH0 - 0.25, TAPO - 0.14, TAPO, ST)
        box(-TSIDE / 2, TSIDE / 2, 0, 0.3, TAPO - 0.14, TAPO + 0.05, SD, bevel=0.02)
        box(-TSIDE / 2, TSIDE / 2, TH0 - 0.25, TH0, TAPO - 0.14, TAPO + 0.06, SD, bevel=0.02)
        box(TSIDE / 2 - 0.2, TSIDE / 2 + 0.05, 0, TH0, TAPO - 0.02, TAPO + 0.12, SD, bevel=0.02)
group('tower-upper')                               # rises as the room stretches
TY0, SP0 = F2, F2 + 13.3
with kit.frame((TWX, 0, TWZ)):
    cyl(TWR, TWR, 13.1, 0, TY0 + 0.15, 0, ST, seg=8, rot=math.pi / 8)
    for yy in (TY0 + 0.15, TY0 + 6.6, TY0 + 13.1):
        cyl(TWR + 0.18, TWR + 0.18, 0.4, 0, yy - 0.2, 0, SD, seg=8, rot=math.pi / 8)
        cyl(TWR + 0.1, TWR + 0.1, 0.1, 0, yy - 0.3, 0, SD, seg=8, rot=math.pi / 8)
    for i in range(8):
        if i == 2:
            continue
        a = i * math.pi / 4
        with kit.frame((math.sin(a) * TAPO, TY0 + 3.4, math.cos(a) * TAPO), ry=a):   # round-headed window surround (the glass is procedural)
            box(-0.5, -0.35, -1.0, 0.65, 0, 0.08, SD, bevel=0.012)
            box(0.35, 0.5, -1.0, 0.65, 0, 0.08, SD, bevel=0.012)
            slab2d([(0.5 * math.cos(t), 0.65 + 0.5 * math.sin(t)) for t in (math.pi * k / 10 for k in range(11))]
                   + [(0.35 * math.cos(t), 0.65 + 0.35 * math.sin(t)) for t in (math.pi * k / 10 for k in range(10, -1, -1))], 0, 0.08, SD)
            box(-0.07, 0.07, 0.98, 1.2, 0, 0.11, SD, bevel=0.012)                   # keystone
            box(-0.55, 0.55, -1.12, -1.0, 0, 0.2, SD, bevel=0.015)                  # sill
        if i % 2 == 0:
            with kit.frame((math.sin(a) * TAPO, TY0 + 9.3, math.cos(a) * TAPO), ry=a):
                torus(0.5, 0.07, SD, seg=16, ring=5)
        with kit.frame((0, 0, 0), ry=a):                                             # corbels under the balcony
            for x in (-0.6, 0.6):
                slab2d([(TAPO, TY0 + 6.575), (TAPO + 0.78, TY0 + 6.575), (TAPO + 0.78, TY0 + 6.45), (TAPO + 0.15, TY0 + 6.05), (TAPO, TY0 + 6.05)],
                       x - 0.09, x + 0.09, SD, plane='zy', bevel=0.01, segs=1)
    cyl(TWR + 0.9, TWR + 0.9, 0.25, 0, TY0 + 6.575, 0, SD, seg=8, rot=math.pi / 8)  # the balcony
    cyl(TWR + 0.3, TWR + 0.55, 0.35, 0, SP0 - 0.175, 0, M['trim'], seg=8, rot=math.pi / 8)   # eave
    prof = [(TWR + 0.3, 0.25), (TWR * 0.82, 1.4), (TWR * 0.63, 2.7), (TWR * 0.45, 4.2), (TWR * 0.27, 5.9), (0.2, 7.6)]
    lathe([(0, 0), (TWR + 0.55, 0)] + prof + [(0, 8.2)], 0, SP0 + 0.15, 0, M['shingle'], seg=8, rot=math.pi / 8)   # the spire, flared
    for j in range(8):                             # ridge rolls up its edges
        t = math.pi / 8 + j * math.pi / 4
        pts = [(r * math.cos(t), SP0 + 0.15 + h, r * math.sin(t)) for r, h in prof]
        for p0, p1 in zip(pts, pts[1:]):
            rod(p0, p1, 0.045, M['shingle_dark'], seg=6)
    for a in (math.pi / 4, -3 * math.pi / 4):      # its two little dormers (glass procedural)
        with kit.frame((math.sin(a) * 2.25, SP0 + 2.0, math.cos(a) * 2.25), ry=a):
            box(-0.45, 0.45, 0, 1.1, -0.5, 0.15, ST, bevel=0.02)
            box(-0.3, -0.225, 0.12, 0.88, 0.15, 0.2, SD)
            box(0.225, 0.3, 0.12, 0.88, 0.15, 0.2, SD)
            box(-0.3, 0.3, 0.06, 0.15, 0.15, 0.24, SD, bevel=0.01)
            box(-0.3, 0.3, 0.85, 0.92, 0.15, 0.2, SD)
            slab2d([(-0.62, 1.08), (0.62, 1.08), (0, 1.62)], -0.62, 0.3, M['shingle_dark'], bevel=0.015, segs=1)
    lathe([(0, 0), (0.12, 0), (0.1, 0.08), (0.05, 0.12), (0.05, 0.2), (0, 0.22)], 0, SP0 + 8.18, 0, M['gold'], seg=10)   # finial
    sphere(0.18, 0, SP0 + 8.5, 0, M['gold'], seg=12)
    cyl(0.05, 0.05, 1.7, 0, SP0 + 8.65, 0, M['iron'], seg=6)
group('tower-iron', lit=True)                      # the balcony's railing
with kit.frame((TWX, 0, TWZ)):
    rr, half = (TWR + 0.82) * math.cos(math.pi / 8), (TWR + 0.82) * math.sin(math.pi / 8)
    for i in range(8):
        if i != 2:
            with kit.frame((0, 0, 0), ry=i * math.pi / 4):
                kit.fence(-half, rr, half, rr, TY0 + 6.825, 0.85, M['iron'], gap=0.2, posts=10)

# ------------------------------------------------------------------ the trees nearest the walls
for ob in trees.spiral(M['bark']) + trees.behind_house(M['bark']):
    blocker(ob, keep_material=True)                # baked with the grounds (grounds.py); here they only shade the walls

# ------------------------------------------------------------------ bake-only scenery: the house's insides, the lawn
group('main')
blocker(box(X0 + SKIN, X1 - SKIN, 0.0, AT, Z0 + SKIN, Z1 - SKIN, M['trim']))
bm = bmesh.new()                                                     # the attic, snug under the mansard slabs
for p in inner_pts:
    bm.verts.new(kit.V(*p))
bmesh.ops.convex_hull(bm, input=bm.verts)
me = bpy.data.meshes.new('attic')
bm.to_mesh(me)
bm.free()
attic = bpy.data.objects.new('attic', me)
attic.data.materials.append(M['trim'])
bpy.context.scene.collection.objects.link(attic)
kit.OBJS.append(attic)
blocker(attic)
blocker(box(-60, 80, -0.6, 0.0, -30, 30, mat('lawn', '#26302a', 0.95)), keep_material=True)



# ------------------------------------------------------------------ lights
COOL = dict(group='cool')
light('moon', 'SUN', (46, 62, -38), hexcol('#b9c4ff'), 5.7, aim=(-42, -58, 39), angle=math.radians(1.5), **COOL)
light('fill', 'SUN', (-40, 30, 60), hexcol('#ff9ec8'), 0.84, aim=(40, -30, -60), shadow=False, **COOL)
SKY = (tuple(c * 1.1 for c in hexcol('#9a86e0')), tuple(c * 1.1 for c in hexcol('#1a1030')))   # js/main.js's hemisphere light
world = kit.sky(*SKY)
light('candle', 'POINT', (48, 18.5, -1), hexcol('#ffa24a'), 344600, size=1.2)
for x in (-4.0, 4.0):
    light('gas_lamp', 'POINT', (x, 2.95, 9.4), hexcol('#ffb24a'), 30, size=0.12)
for x in (-1.6, 1.6):
    light('gate_lamp', 'POINT', (x, 2.5, 10.2), hexcol('#ffb24a'), 20, size=0.12)
for side, (w, holes) in FACADES.items():                            # every lit opening spills light outwards
    for (u0, u1, v0, v1, kind) in holes:
        if kind == 'track':
            continue
        if kind == 'door':
            v0 = 5.08
        power = {'win': 130 if v0 < F2 else 110, 'door': 30, 'door2': 120, 'glass': 90, 'arch': 40}[kind]
        light(f'{side}_{kind}', 'AREA', w.p((u0 + u1) / 2, (v0 + v1) / 2, -0.14), WARM_WINDOW, power,
              size=(u1 - u0) * 0.92, size_y=(v1 - v0) * 0.92, aim=w.n)
for x in (-8.0, 0.0, 8.0):
    light('dormer', 'AREA', (x, 15.75, 4.32), WARM_WINDOW, 40, size=1.1, size_y=1.6, aim=(0, 0, 1))
for i in range(8):
    a = i / 8 * math.tau
    light('cupola', 'AREA', (math.sin(a) * 1.9, cy0 + 1.85, math.cos(a) * 1.9), WARM_WINDOW, 15, size=0.9, size_y=1.6, aim=(math.sin(a), 0, math.cos(a)))
for i in range(8):                                 # the tower's windows (glowing panes on its stone)
    if i == 2:
        continue
    a = i * math.pi / 4
    n = (math.sin(a), 0, math.cos(a))
    light('tower_window', 'AREA', (TWX + n[0] * (TAPO + 0.03), TY0 + 3.4, TWZ + n[2] * (TAPO + 0.03)), WARM_WINDOW, 50, size=0.62, size_y=1.9, aim=n)
    if i % 2 == 0:
        light('tower_round', 'AREA', (TWX + n[0] * (TAPO + 0.03), TY0 + 9.3, TWZ + n[2] * (TAPO + 0.03)), WARM_WINDOW, 15, size=0.6, aim=n)
for a in (math.pi / 4, -3 * math.pi / 4):
    n = (math.sin(a), 0, math.cos(a))
    light('tower_dormer', 'AREA', (TWX + n[0] * 2.43, SP0 + 2.5, TWZ + n[2] * 2.43), WARM_WINDOW, 8, size=0.4, size_y=0.6, aim=n)

kit.save_lights(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exterior_lights.json'), SKY)
kit.build('exterior', 'Ext', A['out'], A['size'], A['cool_size'], A['samples'], cool_world=world,
          hidden=lambda n, c: n[1] < -0.9 and c[1] < 0.02)
