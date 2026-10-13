"""Build, light-bake and export the Stretching Room: the octagonal chamber in the tower, with no windows and no
doors, where the ride begins and the walls stretch.

    blender -b --factory-startup -P blender/stretching_room.py -- --out blender/build --size 1536 --samples 256

Writes stretch.glb (Str_main: the floor and its rug, which stay put; Str_facet0..7: each wall's dressing, which
stretches and melts with that wall of the tower; Str_upper: the ceiling and its cornice, which rise as the room
stretches), stretch_warm.png and stretch_cool.png (sqrt-encoded irradiance) and stretch.json.

warm: the room's lamp and the chandelier's candles. cool: a little ambient light.
The stretching portraits and their frames, the chandelier and the trapdoor stay procedural (js/house.js
buildTower), and so does the tower's stonework (blender/exterior.py). The wall against the house, which the site
left open onto the Library, is dressed like the others. Coordinates match js/house.js (D.TW and buildTower).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
import numpy as np
import kit
from kit import M, mat, box, cyl, lathe, sphere, prism, slab2d, rod, torus, group, light, blocker, empty, hexcol

A = kit.args({'out': 'assets', 'size': 1536, 'cool_size': 768, 'samples': 256})
kit.reset_scene(A['samples'])

F1, F2 = 0.8, 7.4
CX, CZ, R = -16.9, 2.0, 3.0                       # the tower (js/house.js D.TW)
APO = R * math.cos(math.pi / 8)
TH = 0.32
WIN = APO - TH                                    # the walls' inner faces, from the middle
HW = R * math.sin(math.pi / 8) + 0.04 - 0.05      # each wall's dressing reaches this far either side of its middle
H0 = 6.6                                          # the walls' height at rest
CEIL = F2 - 0.15                                  # the ceiling's underside at rest (the site's, under the upper tower)
for name, col, rough in [('stripes', '#7a3a22', 0.85), ('wainscot', '#24140c', 0.6), ('walnut', '#2a170d', 0.55), ('gilt', '#c9a24a', 0.4),
                         ('floor', '#3a2214', 0.6), ('rug', '#5a1420', 0.95), ('plaster', '#9a8070', 0.85), ('wax', '#efe6cf', 0.6)]:
    mat(name, col, rough)
WARM = hexcol('#ffa860')
CANDLE = (1.0, 0.65, 0.32)

def corner(i, k):
    """The inner octagon's corner between wall i and wall i + 1, at the radius r."""
    a = i * math.pi / 4 + math.pi / 8
    r = k / math.cos(math.pi / 8)
    return CX + math.sin(a) * r, CZ + math.cos(a) * r

# ------------------------------------------------------------------ the walls, each in its own group: it stretches and melts with its facet
for i in range(8):
    group(f'facet{i}')
    a = i * math.pi / 4
    with kit.frame((CX, F1, CZ), ry=a):           # local +z is the wall's outward normal, as in js/house.js
        z = WIN
        box(-HW, HW, 0, H0, z - 0.012, z, M['stripes'])                                   # the paper
        box(-HW, HW, 0, 1.6, z - 0.03, z, M['wainscot'])                                  # the wainscot
        for u0, u1 in ((-HW + 0.1, -0.04), (0.04, HW - 0.1)):
            box(u0, u1, 0.36, 1.36, z - 0.05, z - 0.03, M['wainscot'], bevel=0.012)       # its two raised panels
            for v0, v1 in ((0.32, 0.36), (1.36, 1.4)):
                box(u0 - 0.04, u1 + 0.04, v0, v1, z - 0.06, z - 0.03, M['walnut'])
        box(-HW, HW, 0, 0.22, z - 0.06, z, M['walnut'], bevel=0.01)                      # baseboard
        box(-HW, HW, 1.6, 1.72, z - 0.08, z, M['gilt'], bevel=0.015)                     # the gilt chair rail, as the site had it
        box(-HW, HW, 1.56, 1.6, z - 0.06, z, M['walnut'])
    x, zc = corner(i, WIN - 0.02)                                                         # a gilt bead down the corner to the next wall
    rod((x, F1 + 0.22, zc), (x, F1 + H0, zc), 0.045, M['gilt'], seg=8)
    lathe([(0, 0), (0.07, 0), (0.07, 0.22), (0.05, 0.26), (0, 0.26)], x, F1, zc, M['walnut'], seg=8)

# ------------------------------------------------------------------ the ceiling and its cornice, which rise with the upper tower
group('upper')
oct_pts = lambda k: [corner(i, k) for i in range(8)]
prism([(x, CEIL, z) for x, z in oct_pts(WIN + 0.05)], (0, 0.06, 0), M['plaster'])                     # the ceiling
CORNICE = [(0.0, 0.0), (0.05, 0.0), (0.06, 0.03), (0.06, 0.07), (0.1, 0.09), (0.12, 0.14), (0.18, 0.17), (0.2, 0.22), (0.24, 0.24), (0.26, 0.28), (0.0, 0.28)]
for i in range(8):                                # the cornice round the top of the walls, mitred at the corners
    a = i * math.pi / 4
    with kit.frame((CX, CEIL - 0.28, CZ), ry=a):
        prof = [(WIN - d, v) for d, v in CORNICE]  # (z, y) across the wall, extruded along it with mitred ends
        bm = bmesh.new()
        rings = []
        for zz, yy in prof:
            hx = zz * math.tan(math.pi / 8)
            rings.append((bm.verts.new(kit.V(-hx, yy, zz)), bm.verts.new(kit.V(hx, yy, zz))))
        n = len(rings)
        for k in range(n):
            (l0, r0), (l1, r1) = rings[k], rings[(k + 1) % n]
            bm.faces.new((l0, r0, r1, l1))
        bm.faces.new([l for l, _ in rings])
        bm.faces.new([r for _, r in reversed(rings)])
        kit.finish(bm, M['plaster'])
    with kit.frame((CX, CEIL - 0.2, CZ), ry=a):
        z = WIN - 0.09
        hx = z * math.tan(math.pi / 8)
        box(-hx, hx, 0.0, 0.035, z - 0.03, z, M['gilt'])                                 # a gilt fillet along it
for i in range(8):                                # gilt ribs from the corners to the ring round the trapdoor
    x0, z0 = corner(i, WIN - 0.2)
    a = i * math.pi / 4 + math.pi / 8
    x1, z1 = CX + math.sin(a) * 0.82, CZ + math.cos(a) * 0.82
    rod((x0, CEIL - 0.035, z0), (x1, CEIL - 0.035, z1), 0.04, M['gilt'], seg=6)
with kit.frame((CX, CEIL - 0.04, CZ), rx=math.pi / 2):
    torus(0.8, 0.06, M['gilt'], seg=24, ring=6)                                           # the ring round the trapdoor
    torus(1.25, 0.035, M['gilt'], seg=24, ring=5)

# ------------------------------------------------------------------ the floor: boards in a border, and the round rug
group('main')
prism([(x, F1, z) for x, z in oct_pts(WIN + 0.02)], (0, 0.045, 0), M['floor'])
ring = [(CX + 2.0 * math.cos(t), CZ + 2.0 * math.sin(t)) for t in np.linspace(0, math.tau, 48, endpoint=False)]
prism([(x, F1 + 0.045, z) for x, z in ring], (0, 0.012, 0), M['rug'])

# ------------------------------------------------------------------ bake-only: the tower's stone round it, the upper tower over it, the ground under it
for i in range(8):
    a = i * math.pi / 4
    with kit.frame((CX, F1, CZ), ry=a):
        blocker(box(-HW - 0.3, HW + 0.3, -0.5, H0 + 1.0, WIN, APO + 0.4, M['walnut']))
blocker(cyl(R + 0.4, R + 0.4, 1.0, CX, CEIL + 0.06, CZ, M['walnut'], seg=16))
blocker(cyl(R + 0.4, R + 0.4, 0.8, CX, F1 - 0.8, CZ, M['walnut'], seg=16))

# ------------------------------------------------------------------ lights
light('lamp', 'POINT', (CX, 4.8, CZ), WARM, 700, size=0.4)                                 # js/house.js's light in the room
for k in range(6):                                                                         # the chandelier's candles (the chandelier is the site's)
    a = k / 6 * math.tau
    light('candle', 'POINT', (CX + math.cos(a) * 0.55, CEIL - 0.92 + 0.05, CZ + math.sin(a) * 0.55), CANDLE, 21, size=0.03)

def hidden(n, c):
    """Faces no one sees: the floor's underside and the ceiling's top."""
    return n[1] < -0.9 and c[1] < F1 + 0.01 or n[1] > 0.9 and c[1] > CEIL + 0.05

kit.build('stretch', 'Str', A['out'], A['size'], A['cool_size'], A['samples'], hidden=hidden,
          ambient=lambda nrm, ao: ao * np.array([0.08, 0.07, 0.12], np.float32))     # the house's dim, cool ambient
