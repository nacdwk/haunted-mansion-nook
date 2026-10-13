"""Build, light-bake and export the Grand Hall as a detailed, web-ready model.

Run headless (Blender 4.2 or newer):
    blender -b --factory-startup -P blender/grand_hall.py -- --out assets --size 2048 --samples 384

Writes to <out>:
    grandhall.glb        Draco-compressed geometry. Its only UV set is the lightmap layout.
                         Three objects: Hall_Main, plus Hall_Back and Hall_Left, which dissolve with their facades.
                         Empties: Flame_* (candle tips), PipeTop_* (organ pipe mouths), Fire (the hearth).
    grandhall_warm.png   candle, chandelier and fire light (sqrt-encoded irradiance)
    grandhall_cool.png   moonlight through the windows and the ghosts' glow (sqrt-encoded irradiance)
    grandhall.json       the scale each lightmap was encoded with, plus bake stats

Everything is modelled in the site's three.js coordinates (y up); V() converts to Blender's z-up space and
the glTF exporter converts back, so the model lines up with the procedural mansion exactly.
"""
import bpy, bmesh, math, sys, os, json, time
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return type(default)(argv[argv.index(name) + 1]) if name in argv else default
OUT = os.path.abspath(arg('--out', 'assets'))
SIZE = arg('--size', 2048)                 # warm lightmap
COOL_SIZE = arg('--cool-size', SIZE // 2)  # cool light is softer, so half the resolution is enough
SAMPLES = arg('--samples', 256)
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

def V(x, y, z):
    return Vector((x, -z, y))

# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
    log('devices:', [(d.name, d.type, d.use) for d in prefs.devices])
except Exception as e:
    log('GPU unavailable, baking on the CPU:', e)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 2

# ------------------------------------------------------------------ materials: albedos match the site's textures on average
def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexcol(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))
def mat(name, color, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*hexcol(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0.0   # metals bake as diffuse; their sheen is added at runtime
    return m
M = {k: mat(k, c, r) for k, c, r in [
    ('parquet', '#74462a', 0.5), ('inlay_dark', '#2a170d', 0.5), ('inlay_light', '#9a6a3c', 0.5), ('inlay_gold', '#c9a24a', 0.4),
    ('wallpaper', '#62334a', 0.9), ('wood_panel', '#40271a', 0.7), ('gilt', '#c9a24a', 0.4), ('marble', '#bdb5c4', 0.4),
    ('marble_dark', '#5e5668', 0.5), ('velvet', '#5e1426', 0.95), ('cloth', '#a99fb8', 0.9), ('porcelain', '#f4f0f6', 0.4),
    ('silver', '#b8b8c8', 0.35), ('walnut', '#2a170d', 0.6), ('mahogany', '#4a1e14', 0.55), ('ivory', '#efe8da', 0.5),
    ('ebony', '#0d0b10', 0.5), ('void', '#050308', 1.0), ('rug', '#3a3048', 0.95), ('mirror', '#2a2e48', 0.2),
    ('sheet', '#e8dcc0', 0.9), ('ceiling', '#6a4a5c', 0.9), ('brass', '#a8844e', 0.4), ('iron', '#17131d', 0.5),
    ('wax', '#efe6cf', 0.6), ('curtain', '#6a2a44', 0.95), ('bark', '#2b2129', 0.95), ('runner', '#4a2030', 0.95),
]}
BLOCK = mat('blocker', '#4a3a52')

# ------------------------------------------------------------------ mesh helpers (every part is tagged with its export group)
OBJS = []
GRP = 0    # 0 = main, 1 = back-wall dressing, 2 = left-wall dressing (1 and 2 dissolve with their facades)
CEIL = 0   # 1 = ceiling parts, which only the ride sees up close, so they get less lightmap space

def finish(bm, m, name='part'):
    gl = bm.faces.layers.int.get('grp') or bm.faces.layers.int.new('grp')
    cl = bm.faces.layers.int.get('ceil') or bm.faces.layers.int.new('ceil')
    for f in bm.faces:
        f[gl] = GRP
        f[cl] = CEIL
        f.smooth = True               # edges sharper than SHARP_ANGLE are split again after joining
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    COL.objects.link(ob)
    OBJS.append(ob)
    return ob

def box(x0, x1, y0, y1, z0, z1, m, bevel=0.0, seg=1):
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)
    z0, z1 = min(z0, z1), max(z0, z1)
    sx, sy, sz = x1 - x0, y1 - y0, z1 - z0
    if min(sx, sy, sz) < 1e-5:
        return None
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    if bevel > 0:
        bevel = min(bevel, sx * 0.45, sy * 0.45, sz * 0.45)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=seg, affect='EDGES', profile=0.5)
    return finish(bm, m, 'box')

def cyl(r1, r2, h, x, y, z, m, seg=12):
    """Vertical cylinder or cone with its base at y."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, vec=V(x, y + h / 2, z), verts=bm.verts)
    return finish(bm, m, 'cyl')

def hcyl(r, length, x, y, z, axis, m, seg=10):
    """Horizontal cylinder centred at (x, y, z), lying along three's 'x' or 'z' axis."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=length)
    rot = Matrix.Rotation(math.pi / 2, 3, 'Y' if axis == 'x' else 'X')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=rot)
    bmesh.ops.translate(bm, vec=V(x, y, z), verts=bm.verts)
    return finish(bm, m, 'hcyl')

def lathe(profile, x, y, z, m, seg=14):
    """Solid of revolution. profile: [(radius, height)] bottom to top, starting and ending on the axis."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector((r, 0, h))) for r, h in profile]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=list(bm.verts) + list(bm.edges), cent=Vector((0, 0, 0)), axis=Vector((0, 0, 1)),
                   steps=seg, angle=math.tau, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.translate(bm, vec=V(x, y, z), verts=bm.verts)
    return finish(bm, m, 'lathe')

def sphere(r, x, y, z, m, seg=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2 + 1), radius=r)
    bmesh.ops.translate(bm, vec=V(x, y, z), verts=bm.verts)
    return finish(bm, m, 'sphere')

def prism(points, ext, m):
    """A planar polygon (three coords) extruded by the vector ext: a closed solid."""
    bm = bmesh.new()
    e = V(*ext)
    a = [bm.verts.new(V(*p)) for p in points]
    b = [bm.verts.new(V(*p) + e) for p in points]
    n = len(a)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    return finish(bm, m, 'prism')

def sheet(fn, nu, nv, thick, m):
    """A gently folded cloth: fn(u, v) -> three xyz on a grid, thickened into a closed shell."""
    bm = bmesh.new()
    grid = [[bm.verts.new(V(*fn(i / nu, j / nv))) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thick)
    return finish(bm, m, 'sheet')

def empty(name, x, y, z, **props):
    ob = bpy.data.objects.new(name, None)
    ob.location = V(x, y, z)
    ob.empty_display_size = 0.05
    for k, v in props.items():
        ob[k] = v
    COL.objects.link(ob)
    return ob

# ------------------------------------------------------------------ room frame (matches js/house.js and js/rooms.js)
Y0, Y1 = 7.4, 13.6                 # floor, ceiling
FX0, FX1, FZ0, FZ1 = -13.6, 4.47, -4.6, 4.6
WAIN = Y0 + 2.2                    # chair rail
CY = Y1 - 0.02                     # ceiling underside
SLOT = (-13.45, -8.95, -4.65, -1.95)   # where the ride climbs into the attic

class Wall:
    """Local frame on a wall's inner face: u runs along it, v is height, d points into the room."""
    def __init__(self, origin, uaxis, naxis, length):
        self.o, self.u, self.n, self.length = origin, uaxis, naxis, length
    def p(self, u, v, d):
        return tuple(self.o[i] + self.u[i] * u + self.n[i] * d + (v if i == 1 else 0) for i in range(3))
    def box(self, u0, u1, v0, v1, d0, d1, m, bevel=0.0, seg=1):
        a, b = self.p(u0, v0, d0), self.p(u1, v1, d1)
        return box(a[0], b[0], a[1], b[1], a[2], b[2], m, bevel, seg)
    def mold(self, u0, u1, profile, m):
        """profile: [(d, v)] closed polygon across the wall, extruded from u0 to u1."""
        return prism([self.p(u0, v, d) for d, v in profile], tuple(self.u[i] * (u1 - u0) for i in range(3)), m)

BACK = Wall((-13.6, 0, -4.6), (1, 0, 0), (0, 0, 1), FX1 - FX0)
LEFT = Wall((-13.6, 0, -4.6), (0, 0, 1), (1, 0, 0), 9.6)    # runs on under the front facade to the cut edge
PART = Wall((4.47, 0, -4.6), (0, 0, 1), (-1, 0, 0), 9.2)

def subtract(u0, u1, v0, v1, holes):
    """Rectangles covering [u0,u1]x[v0,v1] minus holes [(a,b,c,d)]."""
    us = sorted({u0, u1, *[min(max(h[k], u0), u1) for h in holes for k in (0, 1)]})
    vs = sorted({v0, v1, *[min(max(h[k], v0), v1) for h in holes for k in (2, 3)]})
    out = []
    for j in range(len(vs) - 1):
        for i in range(len(us) - 1):
            cu, cv = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            if any(h[0] < cu < h[1] and h[2] < cv < h[3] for h in holes):
                continue
            if us[i + 1] - us[i] > 1e-4 and vs[j + 1] - vs[j] > 1e-4:
                out.append((us[i], us[i + 1], vs[j], vs[j + 1]))
    return out

def free_runs(u0, u1, blocks, minlen=0.05):
    out, cur = [], u0
    for a, b in sorted(blocks):
        if a > cur:
            out.append((cur, min(a, u1)))
        cur = max(cur, b)
    if cur < u1:
        out.append((cur, u1))
    return [(a, b) for a, b in out if b - a > minlen]

def runs_at(L, holes, v):
    return free_runs(0, L, [(h[0], h[1]) for h in holes if h[2] < v < h[3]])

BASE_PROFILE = [(0, Y0), (0.07, Y0), (0.07, Y0 + 0.22), (0.05, Y0 + 0.25), (0.05, Y0 + 0.28), (0.03, Y0 + 0.3), (0, Y0 + 0.32)]
RAIL_PROFILE = [(0, WAIN - 0.06), (0.05, WAIN - 0.05), (0.08, WAIN - 0.02), (0.08, WAIN + 0.02), (0.05, WAIN + 0.05), (0.06, WAIN + 0.07), (0, WAIN + 0.09)]
CORN_PROFILE = [(0, Y1), (0.42, Y1), (0.42, Y1 - 0.07), (0.36, Y1 - 0.09), (0.33, Y1 - 0.14), (0.27, Y1 - 0.2), (0.2, Y1 - 0.26),
                (0.16, Y1 - 0.27), (0.16, Y1 - 0.36), (0.1, Y1 - 0.38), (0.07, Y1 - 0.44), (0.03, Y1 - 0.47), (0, Y1 - 0.5)]

def pilaster(w, pu):
    """Fluted gilt pilaster on a dark marble plinth, with an Ionic-ish capital."""
    w.box(pu - 0.32, pu + 0.32, Y0, Y0 + 0.42, 0.0, 0.16, M['marble_dark'], bevel=0.02)
    w.box(pu - 0.27, pu + 0.27, Y0 + 0.42, Y0 + 0.52, 0.0, 0.14, M['gilt'], bevel=0.02)
    w.box(pu - 0.22, pu + 0.22, Y0 + 0.52, Y1 - 1.0, 0.0, 0.1, M['gilt'])
    for k in (-0.14, -0.047, 0.047, 0.14):
        w.box(pu + k - 0.022, pu + k + 0.022, Y0 + 0.62, Y1 - 1.1, 0.1, 0.125, M['gilt'])
    w.box(pu - 0.26, pu + 0.26, Y1 - 1.0, Y1 - 0.9, 0.0, 0.14, M['gilt'], bevel=0.02)
    w.box(pu - 0.3, pu + 0.3, Y1 - 0.9, Y1 - 0.72, 0.0, 0.17, M['gilt'], bevel=0.03)
    for s in (-1, 1):
        c = w.p(pu + s * 0.26, Y1 - 0.8, 0.12)
        sphere(0.07, c[0], c[1], c[2], M['gilt'], seg=8)
    w.box(pu - 0.36, pu + 0.36, Y1 - 0.72, Y1 - 0.64, 0.0, 0.2, M['gilt'])

def dress_wall(w, holes=(), pilasters=(), skips=()):
    """Wallpaper over wood wainscot, gilt chair rail, baseboard, cornice with dentils, raised panels, pilasters.
    holes: (u0,u1,v0,v1) openings; skips: (u0,u1) ranges with no raised panels."""
    L = w.length
    for (a, b, c, d) in subtract(0, L, WAIN, Y1 - 0.5, holes):
        w.box(a, b, c, d, 0.0, 0.02, M['wallpaper'])
    for (a, b, c, d) in subtract(0, L, Y0, WAIN, holes):
        w.box(a, b, c, d, 0.0, 0.03, M['wood_panel'])
    for (a, b, c, d) in subtract(0, L, Y1 - 0.5, Y1, holes):
        w.box(a, b, c, d, 0.0, 0.02, M['wallpaper'])
    for a, b in runs_at(L, holes, Y0 + 0.1):
        w.mold(a, b, BASE_PROFILE, M['walnut'])
    for a, b in runs_at(L, holes, WAIN):
        w.mold(a, b, RAIL_PROFILE, M['gilt'])
    for a, b in runs_at(L, holes, Y1 - 0.25):
        w.mold(a, b, CORN_PROFILE, M['gilt'])
        u = a + 0.08
        while u < b - 0.08:
            w.box(u - 0.035, u + 0.035, Y1 - 0.62, Y1 - 0.53, 0.0, 0.12, M['gilt'])
            u += 0.15
    # raised panels, evenly spaced in whatever wall length is free
    blocks = list(skips) + [(p - 0.42, p + 0.42) for p in pilasters] + [(h[0] - 0.12, h[1] + 0.12) for h in holes if h[2] < WAIN]
    v0, v1 = Y0 + 0.5, WAIN - 0.25
    for a, b in free_runs(0.15, L - 0.15, blocks, 0.6):
        n = max(1, round((b - a) / 1.45))
        pw = (b - a - 0.2 * (n - 1)) / n
        for i in range(n):
            p0 = a + i * (pw + 0.2)
            p1 = p0 + pw
            for (pa, pb, pc, pd) in [(p0, p1, v0, v0 + 0.06), (p0, p1, v1 - 0.06, v1), (p0, p0 + 0.06, v0 + 0.06, v1 - 0.06), (p1 - 0.06, p1, v0 + 0.06, v1 - 0.06)]:
                w.box(pa, pb, pc, pd, 0.03, 0.07, M['gilt'])
            w.box(p0 + 0.14, p1 - 0.14, v0 + 0.14, v1 - 0.14, 0.03, 0.09, M['wood_panel'], bevel=0.05)
    for pu in pilasters:
        pilaster(w, pu)

# ------------------------------------------------------------------ walls
# The gallery ramp hugs the back wall from x 4.4 up to x -9, so the back wall keeps its panels low and its
# only pilaster in the corner by the fireplace.
GRP = 1
FXC, FZ = -10.3, -4.58                       # fireplace centre, back wall face
dress_wall(BACK, pilasters=[0.55], skips=[(FXC - 1.65 + 13.6, FXC + 1.65 + 13.6), (12.6, 99)])
GRP = 2
WIN = (0.8, 2.2, 9.0, 12.2)                  # left window: z -3.8..-2.4 (js/house.js), in wall u/v
dress_wall(LEFT, holes=[WIN], pilasters=[8.75], skips=[(0.0, 3.0), (2.9, 8.1)])
# window casing, sill, curtains and pelmet (part of the left facade, so they dissolve with it)
XW = -13.6
WZ0, WZ1, WY0, WY1 = -3.8, -2.4, 9.0, 12.2
box(XW, XW + 0.08, WY0 - 0.06, WY1 + 0.14, WZ0 - 0.14, WZ0, M['walnut'])
box(XW, XW + 0.08, WY0 - 0.06, WY1 + 0.14, WZ1, WZ1 + 0.14, M['walnut'])
box(XW, XW + 0.1, WY1, WY1 + 0.16, WZ0 - 0.2, WZ1 + 0.2, M['walnut'], bevel=0.02)
box(XW, XW + 0.12, WY0 - 0.12, WY0, WZ0 - 0.22, WZ1 + 0.22, M['walnut'], bevel=0.02)
def curtain(z0, z1, folds):
    return sheet(lambda u, v: (XW + 0.2 + 0.05 * math.sin(u * folds * math.tau + 0.6) + 0.015 * math.sin(v * 3.1),
                               8.62 + (12.55 - 8.62) * v, z0 + (z1 - z0) * u), 28, 6, 0.016, M['curtain'])
curtain(-4.35, -3.6, 3.5)
curtain(-2.6, -1.85, 3.5)
box(XW + 0.12, XW + 0.3, 12.5, 12.95, -4.5, -1.7, M['curtain'], bevel=0.04)
box(XW + 0.12, XW + 0.32, 12.92, 12.98, -4.55, -1.65, M['gilt'])
GRP = 0
# partition: the ride's doorway into the seance room (gold casing stays procedural)
dress_wall(PART, holes=[(0.0, 2.45, Y0 - 0.1, 11.35)], pilasters=[3.2, 6.1, 8.9])

# ------------------------------------------------------------------ floor: parquet field, inlaid border, star medallion
box(FX0, FX1, Y0 - 0.05, Y0 + 0.008, FZ0, FZ1, M['parquet'])
for (a0, a1, b0, b1) in [(FX0 + 0.35, FX1 - 0.35, FZ0 + 0.35, FZ0 + 0.7), (FX0 + 0.35, FX1 - 0.35, FZ1 - 0.7, FZ1 - 0.35),
                         (FX0 + 0.35, FX0 + 0.7, FZ0 + 0.7, FZ1 - 0.7), (FX1 - 0.7, FX1 - 0.35, FZ0 + 0.7, FZ1 - 0.7)]:
    box(a0, a1, Y0, Y0 + 0.016, b0, b1, M['inlay_dark'])
for (a0, a1, b0, b1) in [(FX0 + 0.78, FX1 - 0.78, FZ0 + 0.78, FZ0 + 0.83), (FX0 + 0.78, FX1 - 0.78, FZ1 - 0.83, FZ1 - 0.78),
                         (FX0 + 0.78, FX0 + 0.83, FZ0 + 0.83, FZ1 - 0.83), (FX1 - 0.83, FX1 - 0.78, FZ0 + 0.83, FZ1 - 0.83)]:
    box(a0, a1, Y0, Y0 + 0.018, b0, b1, M['inlay_gold'])
MX, MZ = -5.4, 2.45                          # centre of the waltz
for r, m, h in [(1.75, 'inlay_dark', 0.012), (1.62, 'inlay_gold', 0.014), (1.52, 'inlay_light', 0.016)]:
    cyl(r, r, h, MX, Y0, MZ, M[m], seg=48)
for k in range(16):
    a = k / 16 * math.tau
    r = 1.45 if k % 2 == 0 else 0.95
    y = Y0 + 0.016
    pts = [(MX, y, MZ), (MX + math.cos(a - 0.17) * 0.32, y, MZ + math.sin(a - 0.17) * 0.32),
           (MX + math.cos(a) * r, y, MZ + math.sin(a) * r), (MX + math.cos(a + 0.17) * 0.32, y, MZ + math.sin(a + 0.17) * 0.32)]
    prism(pts, (0, 0.006, 0), M['inlay_gold' if k % 2 == 0 else 'inlay_dark'])
cyl(0.22, 0.22, 0.026, MX, Y0, MZ, M['inlay_gold'], seg=24)
box(-11.8, -9.4, Y0 + 0.008, Y0 + 0.024, 0.0, 3.2, M['rug'])     # hearth rug (texture applied at runtime)

# ------------------------------------------------------------------ coffered ceiling, kept clear of the ride's climb into the attic
CEIL = 1
for (a, b, c, d) in subtract(FX0, FX1, FZ0, FZ1, [SLOT]):
    box(a, b, CY - 0.04, CY, c, d, M['ceiling'])
# The front bay stays plain: a beam there would hide the chandelier from the usual viewing angle,
# since you look in under the attic floor's front edge.
xs = [FX0 + 0.5 + i * (FX1 - FX0 - 1.0) / 7 for i in range(8)]
zs = [FZ0 + 0.5 + i * 2.05 for i in range(4)]
def clear_for_ride(x, z, pad=0.3):
    in_slot = SLOT[0] - pad < x < SLOT[1] + pad and SLOT[2] - pad < z < SLOT[3] + pad
    return in_slot or (x < -3.8 and z < -1.3)
for x in xs:
    for (z0, z1) in zip(zs, zs[1:]):
        if not clear_for_ride(x, (z0 + z1) / 2):
            box(x - 0.13, x + 0.13, CY - 0.24, CY - 0.04, z0, z1, M['gilt'], bevel=0.03)
for z in zs:
    for (x0, x1) in zip(xs, xs[1:]):
        if not clear_for_ride((x0 + x1) / 2, z):
            box(x0, x1, CY - 0.24, CY - 0.04, z - 0.13, z + 0.13, M['gilt'], bevel=0.03)
for (x0, x1) in zip(xs, xs[1:]):
    for (z0, z1) in zip(zs, zs[1:]):
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        if clear_for_ride(cx, cz, 0.9):
            continue
        hw, hd = (x1 - x0) / 2 - 0.3, (z1 - z0) / 2 - 0.3
        for (a, b, c, d) in [(cx - hw, cx + hw, cz - hd, cz - hd + 0.05), (cx - hw, cx + hw, cz + hd - 0.05, cz + hd),
                             (cx - hw, cx - hw + 0.05, cz - hd + 0.05, cz + hd - 0.05), (cx + hw - 0.05, cx + hw, cz - hd + 0.05, cz + hd - 0.05)]:
            box(a, b, CY - 0.1, CY - 0.04, c, d, M['gilt'])
        sphere(0.07, cx, CY - 0.1, cz, M['gilt'], seg=8)
lathe([(0, CY - 0.18), (0.35, CY - 0.17), (0.6, CY - 0.12), (0.9, CY - 0.1), (1.05, CY - 0.06), (1.12, CY - 0.04), (0, CY - 0.04)], -5.0, 0, 1.6, M['gilt'], seg=32)
CEIL = 0

# ------------------------------------------------------------------ the gallery ramp the ride climbs (track runs 0.38 above it)
AX, AY, BX, BY = 4.4, 7.39, -9.0, 13.24
SL = (BY - AY) / (AX - BX)
def ytop(x):
    return AY + (AX - x) * SL
def slab(x0, x1, ya, yb, z0, z1, thick, m):
    return prism([(x0, ya, z1), (x1, yb, z1), (x1, yb - thick, z1), (x0, ya - thick, z1)], (0, 0, z0 - z1), m)
slab(AX, BX, ytop(AX), ytop(BX), -4.58, -2.2, 0.2, M['walnut'])
slab(AX, BX, ytop(AX) - 0.2, ytop(BX) - 0.2, -2.24, -2.16, 0.18, M['gilt'])          # gilt fascia under the edge
slab(AX, BX, ytop(AX) + 0.006, ytop(BX) + 0.006, -4.5, -2.35, 0.006, M['runner'])   # carpet runner
slab(AX, BX, ytop(AX) + 0.78, ytop(BX) + 0.78, -2.33, -2.17, 0.08, M['walnut'])     # handrail
slab(AX, BX, ytop(AX) + 0.82, ytop(BX) + 0.82, -2.3, -2.2, 0.04, M['gilt'])
slab(AX, BX, ytop(AX) + 0.1, ytop(BX) + 0.1, -2.3, -2.2, 0.06, M['walnut'])         # shoe rail
BAL = [(0, 0), (0.05, 0), (0.05, 0.05), (0.035, 0.08), (0.06, 0.2), (0.065, 0.3), (0.035, 0.45), (0.03, 0.5), (0.045, 0.56), (0.035, 0.6), (0, 0.6)]
x, n = AX - 0.25, 0
while x > BX + 0.2:
    yb = ytop(x) + 0.1
    if n % 11 == 0:
        box(x - 0.08, x + 0.08, yb - 0.1, yb + 0.78, -2.33, -2.17, M['walnut'], bevel=0.015)
        sphere(0.07, x, yb + 0.85, -2.25, M['gilt'], seg=10)
    else:
        lathe([(r, yb + h * 1.12) for r, h in BAL], x, 0, -2.25, M['gilt'], seg=10)
    x -= 0.3
    n += 1
for k in (0.15, 0.37, 0.59, 0.81):          # turned gilt columns with knee braces back to the wall
    px = AX + (BX - AX) * k
    top = ytop(px) - 0.2
    lathe([(0, Y0), (0.17, Y0), (0.17, Y0 + 0.12), (0.13, Y0 + 0.2), (0.11, Y0 + 0.28), (0.1, top - 0.32), (0.13, top - 0.24),
           (0.17, top - 0.12), (0.2, top), (0, top)], px, 0, -2.45, M['gilt'], seg=14)
    prism([(px - 0.04, top, -2.45), (px - 0.04, top - 0.6, -2.45), (px - 0.04, top, -3.3)], (0.08, 0, 0), M['gilt'])

# ------------------------------------------------------------------ the pipe organ (left wall)
OX = -13.58                       # back of the case
OZ0, OZ1 = -1.5, 3.3
PB = Y0 + 1.62                    # pipe feet stand on the impost
PIPES = []
box(OX, OX + 0.75, Y0, Y0 + 1.5, OZ0, OZ1, M['walnut'], bevel=0.02)
for zc in (-0.93, 2.73):          # the console hides the middle of the case front
    box(OX + 0.75, OX + 0.79, Y0 + 0.25, Y0 + 1.25, zc - 0.47, zc + 0.47, M['gilt'])
    box(OX + 0.75, OX + 0.82, Y0 + 0.35, Y0 + 1.15, zc - 0.37, zc + 0.37, M['mahogany'], bevel=0.03)
box(OX, OX + 0.85, Y0 + 1.5, PB, OZ0 - 0.1, OZ1 + 0.1, M['gilt'], bevel=0.02)
box(OX, OX + 0.08, PB, Y0 + 4.9, OZ0, OZ1, M['walnut'])
def pipe(x, z, h, r):
    lathe([(0, PB), (0.025, PB), (r * 0.85, PB + 0.3), (r, PB + 0.34), (r, PB + h), (0, PB + h)], x, 0, z, M['gilt'], seg=12)
    box(x + r * 0.6, x + r + 0.006, PB + 0.38, PB + 0.58, z - r * 0.5, z + r * 0.5, M['ebony'])
    box(x + r * 0.7, x + r + 0.012, PB + 0.58, PB + 0.62, z - r * 0.55, z + r * 0.55, M['gilt'])
    PIPES.append((x, PB + h, z))
FINIAL = [(0, 0), (0.11, 0), (0.15, 0.07), (0.09, 0.16), (0.13, 0.27), (0.05, 0.38), (0.02, 0.48), (0, 0.5)]
for zc in (-0.85, 2.65):          # two towers of five
    hs = [2.2, 2.5, 2.75, 2.5, 2.2]
    for i, h in enumerate(hs):
        pipe(OX + 0.4, zc + (i - 2) * 0.25, h, 0.105)
    top = PB + max(hs)
    for s in (-1, 1):
        box(OX + 0.56, OX + 0.66, PB, top + 0.04, zc + s * 0.66 - 0.05, zc + s * 0.66 + 0.05, M['gilt'])
    box(OX, OX + 0.72, top + 0.04, top + 0.22, zc - 0.72, zc + 0.72, M['gilt'], bevel=0.03)
    box(OX, OX + 0.78, top + 0.22, top + 0.3, zc - 0.78, zc + 0.78, M['walnut'], bevel=0.02)
    lathe([(r, top + 0.3 + h) for r, h in FINIAL], OX + 0.4, 0, zc, M['gilt'], seg=10)
for i, h in enumerate([1.55, 1.75, 1.95, 2.1, 2.2, 2.1, 1.95, 1.75, 1.55]):     # the flat between them
    pipe(OX + 0.32, 0.1 + i * 0.2, h, 0.075)
for i in range(13):               # crest arch over the flat
    a = math.pi * i / 12
    zz, yy = 0.9 + math.cos(a) * 0.95, PB + 2.32 + math.sin(a) * 0.35
    box(OX, OX + 0.6, yy - 0.07, yy + 0.07, zz - 0.11, zz + 0.11, M['gilt'], bevel=0.03)
lathe([(r * 1.2, PB + 2.72 + h * 1.2) for r, h in FINIAL], OX + 0.35, 0, 0.9, M['gilt'], seg=12)
# console, flush against the case front
CX0 = OX + 0.75
box(CX0, CX0 + 0.55, Y0, Y0 + 0.78, -0.35, 2.15, M['walnut'], bevel=0.02)
for zc in (-0.42, 2.22):
    prism([(CX0, Y0, zc - 0.07), (CX0 + 0.68, Y0, zc - 0.07), (CX0 + 0.68, Y0 + 0.88, zc - 0.07), (CX0 + 0.4, Y0 + 1.42, zc - 0.07), (CX0, Y0 + 1.48, zc - 0.07)], (0, 0, 0.14), M['walnut'])
for k in range(3):                # three manuals, stepped back and up
    y = Y0 + 0.8 + k * 0.12
    x1 = CX0 + 0.62 - k * 0.13
    x0 = x1 - 0.24
    box(x0, x1, y, y + 0.045, -0.33, 2.13, M['ivory'])
    z, nk = -0.3, 0
    while z < 2.08:
        if nk % 7 not in (2, 6):
            box(x0 + 0.02, x1 - 0.1, y + 0.045, y + 0.08, z + 0.042, z + 0.07, M['ebony'])
        z += 0.066
        nk += 1
    box(x0 - 0.03, x0, y - 0.02, y + 0.13, -0.35, 2.15, M['walnut'])
prism([(CX0 + 0.12, Y0 + 1.2, -0.2), (CX0 + 0.22, Y0 + 1.2, -0.2), (CX0 + 0.06, Y0 + 1.68, -0.2), (CX0 - 0.02, Y0 + 1.68, -0.2)], (0, 0, 2.2), M['walnut'])
for zz in (0.25, 0.95):           # sheet music on the desk
    prism([(CX0 + 0.13, Y0 + 1.27, zz), (CX0 + 0.155, Y0 + 1.27, zz), (CX0 + 0.06, Y0 + 1.62, zz), (CX0 + 0.035, Y0 + 1.62, zz)], (0, 0, 0.6), M['sheet'])
for zc in (-0.28, 2.08):          # stop knobs
    for row in range(3):
        for col in (-1, 1):
            hcyl(0.022, 0.08, CX0 + 0.3 - row * 0.06, Y0 + 1.0 + row * 0.13, zc + col * 0.055, 'x', M['ivory'], seg=8)
for k in range(9):                # pedalboard
    zz = -0.15 + k * 0.26
    box(CX0 + 0.5, CX0 + 1.0, Y0 + 0.01, Y0 + 0.07, zz - 0.05, zz + 0.05, M['walnut'])
lathe([(0, 0), (0.05, 0), (0.02, 0.03), (0.015, 0.28), (0.1, 0.3), (0.14, 0.4), (0.0, 0.42)], CX0 + 0.25, Y0 + 1.5, 0.9, M['brass'], seg=12)
box(-12.25, -11.85, Y0 + 0.5, Y0 + 0.58, 0.35, 1.45, M['walnut'], bevel=0.02)       # bench
box(-12.22, -11.88, Y0 + 0.58, Y0 + 0.64, 0.38, 1.42, M['velvet'], bevel=0.02)
for zz in (0.42, 1.38):
    for xx in (-12.18, -11.92):
        lathe([(0, Y0), (0.035, Y0), (0.045, Y0 + 0.12), (0.028, Y0 + 0.25), (0.04, Y0 + 0.4), (0.035, Y0 + 0.5), (0, Y0 + 0.5)], xx, 0, zz, M['walnut'], seg=8)

# ------------------------------------------------------------------ fireplace and overmantel mirror (back wall)
box(FXC - 1.5, FXC + 1.5, Y0, Y0 + 0.07, FZ, FZ + 0.85, M['marble_dark'], bevel=0.02)
box(FXC - 0.95, FXC + 0.95, Y0, Y0 + 1.75, FZ, FZ + 0.3, M['void'])
for s in (-1, 1):
    jx = FXC + s * 1.17
    box(jx - 0.24, jx + 0.24, Y0 + 0.07, Y0 + 0.3, FZ, FZ + 0.62, M['marble'], bevel=0.03)
    box(jx - 0.19, jx + 0.19, Y0 + 0.3, Y0 + 1.9, FZ, FZ + 0.55, M['marble'], bevel=0.02)
    for k in (-0.1, 0, 0.1):
        box(jx + k - 0.02, jx + k + 0.02, Y0 + 0.4, Y0 + 1.8, FZ + 0.55, FZ + 0.58, M['marble'])
    prism([(jx - 0.2, Y0 + 1.9, FZ + 0.62), (jx + 0.2, Y0 + 1.9, FZ + 0.62), (jx + 0.2, Y0 + 2.2, FZ + 0.62), (jx + 0.12, Y0 + 2.28, FZ + 0.62),
           (jx - 0.12, Y0 + 2.28, FZ + 0.62), (jx - 0.2, Y0 + 2.2, FZ + 0.62)], (0, 0, -0.62), M['marble'])
box(FXC - 0.95, FXC + 0.95, Y0 + 1.75, Y0 + 2.28, FZ, FZ + 0.5, M['marble'], bevel=0.02)
hcyl(0.2, 0.05, FXC, Y0 + 2.02, FZ + 0.52, 'z', M['gilt'], seg=16)          # cartouche on the frieze
box(FXC - 1.55, FXC + 1.55, Y0 + 2.28, Y0 + 2.36, FZ, FZ + 0.72, M['marble'], bevel=0.02)
box(FXC - 1.6, FXC + 1.6, Y0 + 2.36, Y0 + 2.44, FZ, FZ + 0.78, M['marble'], bevel=0.03)
for s in (-1, 1):                 # fire dogs
    box(FXC + s * 0.42 - 0.04, FXC + s * 0.42 + 0.04, Y0, Y0 + 0.42, FZ + 0.38, FZ + 0.46, M['iron'])
    box(FXC + s * 0.42 - 0.04, FXC + s * 0.42 + 0.04, Y0 + 0.02, Y0 + 0.08, FZ + 0.3, FZ + 0.85, M['iron'])
    sphere(0.06, FXC + s * 0.42, Y0 + 0.46, FZ + 0.42, M['brass'], seg=10)
for (lx, ly, lz) in [(-0.15, 0.13, 0.4), (0.18, 0.13, 0.46), (0.02, 0.27, 0.43)]:    # logs
    hcyl(0.085, 0.82, FXC + lx, Y0 + ly, FZ + lz, 'x', M['bark'], seg=8)
box(FXC - 0.85, FXC + 0.85, Y0 + 0.07, Y0 + 0.13, FZ + 0.88, FZ + 0.94, M['brass'])   # fender
OM0, OM1 = Y0 + 2.6, Y0 + 4.85
box(FXC - 0.9, FXC + 0.9, OM0, OM1, FZ, FZ + 0.03, M['mirror'])
for (a, b, c, d) in [(FXC - 1.05, FXC + 1.05, OM0 - 0.15, OM0), (FXC - 1.05, FXC + 1.05, OM1, OM1 + 0.15), (FXC - 1.05, FXC - 0.9, OM0, OM1), (FXC + 0.9, FXC + 1.05, OM0, OM1)]:
    box(a, b, c, d, FZ, FZ + 0.1, M['gilt'], bevel=0.03)
for i in range(9):
    a = math.pi * i / 8
    box(FXC + math.cos(a) * 0.7 - 0.09, FXC + math.cos(a) * 0.7 + 0.09, OM1 + 0.15 + math.sin(a) * 0.35, OM1 + 0.29 + math.sin(a) * 0.35, FZ, FZ + 0.08, M['gilt'], bevel=0.02)
empty('Fire', FXC, Y0 + 0.2, FZ + 0.43)

# ------------------------------------------------------------------ the birthday table: cloth, settings, candelabras, chairs
TX0, TX1, TZ0, TZ1, TT = -7.8, -1.8, -1.275, -0.025, Y0 + 0.95
box(TX0, TX1, TT - 0.06, TT, TZ0, TZ1, M['cloth'])
def drape(z, outward):
    return sheet(lambda u, v: (TX0 - 0.02 + (TX1 - TX0 + 0.04) * u, TT - 0.02 - 0.45 * v,
                               z + outward * (0.02 + 0.05 * v + 0.035 * v * math.sin(u * 10 * math.tau))), 60, 5, 0.012, M['cloth'])
drape(TZ1 + 0.01, 1)
drape(TZ0 - 0.01, -1)
for xx in (TX0 - 0.03, TX1):
    box(xx, xx + 0.03, TT - 0.47, TT, TZ0 - 0.02, TZ1 + 0.02, M['cloth'])
for xx in (TX0 + 0.25, TX1 - 0.25):
    for zz in (TZ0 + 0.2, TZ1 - 0.2):
        lathe([(0, Y0), (0.07, Y0), (0.06, Y0 + 0.1), (0.05, Y0 + 0.2), (0.075, Y0 + 0.3), (0.045, Y0 + 0.45), (0.06, Y0 + 0.5), (0, Y0 + 0.5)], xx, 0, zz, M['mahogany'], seg=10)
FLAMES = []
for i in range(5):
    px = -7.0 + i * 1.2
    if abs(px + 4.6) < 0.3:       # the cake (procedural) sits at x -4.6
        continue
    lathe([(0, TT + 0.001), (0.2, TT + 0.001), (0.21, TT + 0.012), (0.15, TT + 0.016), (0, TT + 0.016)], px, 0, -0.95, M['porcelain'], seg=20)
    lathe([(0, TT), (0.06, TT), (0.02, TT + 0.04), (0.012, TT + 0.14), (0.05, TT + 0.17), (0.06, TT + 0.27), (0.0, TT + 0.27)], px + 0.3, 0, -0.75, M['silver'], seg=10)
    box(px - 0.27, px - 0.25, TT, TT + 0.006, -1.1, -0.82, M['silver'])
    box(px + 0.23, px + 0.25, TT, TT + 0.006, -1.1, -0.82, M['silver'])
def candelabra(x, y, z):
    lathe([(0, 0), (0.16, 0), (0.13, 0.05), (0.04, 0.12), (0.035, 0.6), (0.06, 0.66), (0.03, 0.72), (0, 0.72)], x, y, z, M['silver'], seg=12)
    hcyl(0.02, 0.62, x, y + 0.66, z, 'x', M['silver'], seg=6)
    for ax in (-0.31, 0, 0.31):
        yy = y + (0.78 if ax == 0 else 0.68)
        cyl(0.05, 0.035, 0.05, x + ax, yy - 0.05, z, M['silver'], seg=8)
        cyl(0.025, 0.025, 0.22, x + ax, yy, z, M['wax'], seg=8)
        FLAMES.append((x + ax, yy + 0.24, z, 0.75))
candelabra(-6.4, TT, -0.45)
candelabra(-2.8, TT, -0.45)
def chair(x, z):
    """High-backed dining chair facing +z (towards the room)."""
    sy = Y0 + 0.52
    bz = z - 0.25
    box(x - 0.29, x + 0.29, sy - 0.08, sy, z - 0.27, z + 0.27, M['mahogany'], bevel=0.02)
    box(x - 0.27, x + 0.27, sy, sy + 0.08, z - 0.25, z + 0.25, M['velvet'], bevel=0.035)
    for lx in (-0.24, 0.24):
        lathe([(0, Y0), (0.035, Y0), (0.03, Y0 + 0.1), (0.04, Y0 + 0.22), (0.028, Y0 + 0.36), (0.035, sy - 0.08), (0, sy - 0.08)], x + lx, 0, z + 0.22, M['mahogany'], seg=8)
        box(x + lx - 0.03, x + lx + 0.03, Y0, sy + 1.05, bz - 0.03, bz + 0.03, M['mahogany'], bevel=0.01)
    crest = [(x - math.cos(math.pi * i / 8) * 0.27, sy + 1.0 + math.sin(math.pi * i / 8) * 0.14, bz) for i in range(9)]
    prism(crest + [(x + 0.27, sy + 0.92, bz), (x - 0.27, sy + 0.92, bz)], (0, 0, 0.05), M['mahogany'])
    prism([(x - 0.05, sy + 0.08, bz), (x + 0.05, sy + 0.08, bz), (x + 0.12, sy + 0.35, bz), (x + 0.08, sy + 0.6, bz), (x + 0.14, sy + 0.92, bz),
           (x - 0.14, sy + 0.92, bz), (x - 0.08, sy + 0.6, bz), (x - 0.12, sy + 0.35, bz)], (0, 0, 0.035), M['mahogany'])
    box(x - 0.2, x + 0.2, sy + 0.25, sy + 0.85, bz + 0.035, bz + 0.055, M['velvet'], bevel=0.008)
for x in (-7.0, -5.8, -4.6, -3.4, -2.2):
    chair(x, -1.75)

# ------------------------------------------------------------------ wall sconces, three candles each
def sconce(wall, u, v):
    wall.box(u - 0.1, u + 0.1, v - 0.32, v + 0.32, 0.0, 0.05, M['brass'], bevel=0.02)
    wall.box(u - 0.25, u + 0.25, v - 0.1, v - 0.06, 0.04, 0.32, M['brass'])
    for k in (-1, 0, 1):
        q = wall.p(u + k * 0.22, v - 0.06, 0.3)
        cyl(0.055, 0.035, 0.05, q[0], q[1], q[2], M['brass'], seg=8)
        cyl(0.022, 0.022, 0.18, q[0], q[1] + 0.05, q[2], M['wax'], seg=8)
        FLAMES.append((q[0], q[1] + 0.26, q[2], 0.65))
sconce(PART, 4.6, 10.4)
sconce(PART, 7.6, 10.4)
sconce(BACK, 1.2, 11.0)

for i, (x, y, z, s) in enumerate(FLAMES):
    empty(f'Flame_{i:03d}', x, y, z, flameScale=s)
for i, (x, y, z) in enumerate(PIPES):
    empty(f'PipeTop_{i:03d}', x, y, z)

# ------------------------------------------------------------------ bake-only surroundings: the room is lit as if closed
HELP = []
def helper(ob):
    OBJS.remove(ob)
    ob.data.materials.clear()
    ob.data.materials.append(BLOCK)
    HELP.append(ob)
for b in [(-13.9, 4.8, Y0 - 0.4, Y1 + 0.4, 5.0, 5.3),           # front facade (the room runs on to its outer skin)
          (-13.9, 4.8, Y1, Y1 + 0.4, -4.9, 5.3),                 # attic floor
          (-14.2, -13.6, Y0 - 0.4, Y1 + 0.4, -4.9, 5.3),         # left wall
          (-13.9, 4.8, Y0 - 0.4, Y1 + 0.4, -4.9, -4.6),          # back wall
          (4.47, 4.8, Y0 - 0.4, Y1 + 0.4, -4.9, 5.3),            # partition
          (-13.9, 4.8, Y0 - 0.4, Y0 - 0.05, -4.9, 5.3)]:         # floor slab
    helper(box(*b, BLOCK))

def add_light(name, kind, xyz, color, power, size=0.1, rot=None, group='warm'):
    ld = bpy.data.lights.new(name, kind)
    ld.color = color
    ld.energy = power
    if kind == 'AREA':
        ld.size = size
        ld.shape = 'SQUARE'
    else:
        ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = V(*xyz)
    if rot:
        ob.rotation_euler = rot   # area lights shine down their local -Z
    COL.objects.link(ob)
    ob['group'] = group
    return ob
INTO_ROOM_FROM_FRONT = (math.pi / 2, 0, 0)     # -> three -z
OUT_OF_BACK_WALL = (-math.pi / 2, 0, 0)        # -> three +z
FROM_LEFT_WALL = (0, -math.pi / 2, 0)          # -> three +x
FROM_PARTITION = (0, math.pi / 2, 0)           # -> three -x
LIGHTS = [
    add_light('chandelier', 'POINT', (-5.0, 12.4, 1.6), (1.0, 0.72, 0.42), 2600, 0.9),
    add_light('fire', 'AREA', (FXC, Y0 + 0.6, FZ + 0.52), (1.0, 0.45, 0.14), 900, 1.4, rot=OUT_OF_BACK_WALL),
    add_light('organ_lamp', 'POINT', (CX0 + 0.33, Y0 + 1.76, 0.9), (1.0, 0.7, 0.4), 18, 0.06),
    add_light('cake', 'POINT', (-4.6, Y0 + 1.7, -0.55), (1.0, 0.68, 0.36), 25, 0.1),
]
for i, (x, y, z, s) in enumerate(FLAMES):
    LIGHTS.append(add_light(f'candle_{i}', 'POINT', (x, y + 0.03, z), (1.0, 0.65, 0.32), 21 * s, 0.04))
LIGHTS += [
    add_light('ghosts', 'POINT', (-5.4, 9.2, 2.45), (0.48, 0.94, 1.0), 520, 1.4, group='cool'),
    add_light('wisps', 'POINT', (-12.6, 12.0, 0.9), (0.75, 0.55, 1.0), 300, 0.8, group='cool'),
    add_light('window_left', 'AREA', (-13.3, 10.6, -3.1), (0.55, 0.62, 1.0), 260, 1.4, rot=FROM_LEFT_WALL, group='cool'),
    add_light('balcony_door', 'AREA', (0.0, 9.9, 4.95), (0.55, 0.62, 1.0), 150, 1.8, rot=INTO_ROOM_FROM_FRONT, group='cool'),
    add_light('seance_door', 'AREA', (4.4, 9.0, -3.4), (0.6, 0.38, 1.0), 100, 1.6, rot=FROM_PARTITION, group='cool'),
]
for wx in (-11.5, -7.2, -2.6, 2.6):
    LIGHTS.append(add_light(f'window_front_{wx}', 'AREA', (wx, 10.5, 4.95), (0.55, 0.62, 1.0), 120, 1.4, rot=INTO_ROOM_FROM_FRONT, group='cool'))
world = bpy.data.worlds.new('night')
scene.world = world
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.0

# ------------------------------------------------------------------ join, strip faces nobody can see, lightmap UVs
log('parts:', len(OBJS))
bpy.ops.object.select_all(action='DESELECT')
for ob in OBJS:
    ob.select_set(True)
bpy.context.view_layer.objects.active = OBJS[0]
bpy.ops.object.join()
HALL = bpy.context.view_layer.objects.active
HALL.name = 'GrandHall'
me = HALL.data
bm = bmesh.new()
bm.from_mesh(me)
# 1. faces buried inside or pressed against other parts: every sample point just in front of them is inside a solid
bvh = BVHTree.FromBMesh(bm)
PROBES = [Vector((0.31, 0.53, 0.79)).normalized(), Vector((-0.71, 0.19, -0.68)).normalized(), Vector((0.12, -0.88, 0.45)).normalized()]
def inside(p):
    votes = 0
    for d in PROBES:
        hit, nrm, _, _ = bvh.ray_cast(p, d)
        if hit is not None and nrm.dot(d) > 0:      # met a face from behind: p is inside that solid
            votes += 1
    return votes >= 2
dead = []
for f in bm.faces:
    c, n = f.calc_center_median(), f.normal
    vs = list(f.verts)
    vs = vs[::max(1, len(vs) // 8)]
    pts = [c] + [v.co + (c - v.co).normalized() * min(0.01, (c - v.co).length * 0.5) for v in vs]
    pts += [(a.co + b.co) / 2 for a, b in zip(vs, vs[1:] + vs[:1])]
    if all(inside(p + n * 0.003) for p in pts):
        dead.append(f)
buried = len(dead)
# 2. faces against the room's own walls, floor and ceiling (the shell is procedural and stays behind them)
dead = set(dead)
for f in bm.faces:
    n, c = f.normal, f.calc_center_median()
    nx, ny, nz = n.x, n.z, -n.y           # back to three's axes
    cx, cy, cz = c.x, c.z, -c.y
    if ((nx < -0.9 and cx < FX0 + 0.004) or (nz < -0.9 and cz < FZ0 + 0.004) or (nx > 0.9 and cx > FX1 - 0.004)
            or (ny < -0.9 and cy < Y0 + 0.03) or (ny > 0.9 and cy > CY - 0.045)):
        dead.add(f)
bmesh.ops.delete(bm, geom=list(dead), context='FACES')
bm.to_mesh(me)
bm.free()
me.set_sharp_from_angle(angle=math.radians(50))   # round things shade smooth, boxes keep crisp edges
log(f'removed {buried} buried faces and {len(dead) - buried} faces against the shell')
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
me.uv_layers.new(name='LM')
tris = sum(len(p.vertices) - 2 for p in me.polygons)
log(f'joined: {len(me.polygons)} faces ({tris} triangles), {len(me.materials)} materials')

bpy.ops.object.mode_set(mode='EDIT')
bpy.context.tool_settings.mesh_select_mode = (False, False, True)
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
log('smart project done')
bm = bmesh.from_edit_mesh(me)
uvl = bm.loops.layers.uv['LM']
cl = bm.faces.layers.int['ceil']
for f in bm.faces:                # ceiling islands at half the texel density
    if f[cl]:
        for lp in f.loops:
            lp[uvl].uv *= 0.5
bmesh.update_edit_mesh(me)
bpy.ops.uv.select_all(action='SELECT')
try:
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=0.003, shape_method='AABB')
except TypeError:
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
log('lightmap UVs packed')

# ------------------------------------------------------------------ bake both light groups, plus ambient occlusion
def bake_pass(name, size, kind, group=None):
    img = bpy.data.images.new(f'lm_{name}', size, size, float_buffer=True, alpha=False)
    for m in me.materials:
        nt = m.node_tree
        node = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE'
        node.image = img
        nt.nodes.active = node
    for L in LIGHTS:
        L.hide_render = (L['group'] != group)
    bpy.ops.object.select_all(action='DESELECT')
    HALL.select_set(True)
    bpy.context.view_layer.objects.active = HALL
    t = time.time()
    if kind == 'AO':
        bpy.ops.object.bake(type='AO', margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    elif kind == 'NORMAL':
        bpy.ops.object.bake(type='NORMAL', normal_space='OBJECT', margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    else:
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    secs = time.time() - t
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(size, size, 4)[..., :3]
    k = np.array([1, 4, 6, 4, 1], np.float32)
    k /= k.sum()
    pad = np.pad(rgb, ((2, 2), (2, 2), (0, 0)), mode='edge')       # light 5x5 binomial denoise
    tmp = sum(pad[:, i:i + size, :] * k[i] for i in range(5))
    log(f'baked {name} in {secs:.1f}s')
    return sum(tmp[i:i + size, :, :] * k[i] for i in range(5)), secs

def save_png(name, rgb, alpha=None):
    size = rgb.shape[0]
    out = bpy.data.images.new(f'out_{name}', size, size, alpha=alpha is not None)
    out.colorspace_settings.name = 'Non-Color'
    o = np.ones((size, size, 4), np.float32)
    o[..., :3] = rgb
    if alpha is not None:
        o[..., 3] = alpha
    out.pixels.foreach_set(o.ravel())
    out.filepath_raw = os.path.join(OUT, f'grandhall_{name}.png')
    out.file_format = 'PNG'
    out.alpha_mode = 'STRAIGHT'
    out.save()

def encode(rgb, secs):
    """sqrt(irradiance / scale) keeps precision in the shadows of an 8-bit image"""
    lum = rgb.mean(axis=2)
    lit = lum[lum > 1e-5]
    scale = float(max(np.percentile(lit, 99.7) * 1.15, 1e-3)) if lit.size else 1.0
    st = dict(scale=scale, size=rgb.shape[0], seconds=round(secs, 1), mean=float(lit.mean()) if lit.size else 0,
              p50=float(np.percentile(lit, 50)) if lit.size else 0, clipped=float((lum > scale).mean()))
    return np.sqrt(np.clip(rgb / scale, 0, 1)), st

warm, secs = bake_pass('warm', SIZE, 'DIFFUSE', 'warm')
warm, st_warm = encode(warm, secs)
save_png('warm', warm)
cool, secs = bake_pass('cool', COOL_SIZE, 'DIFFUSE', 'cool')
# Every procedural room is also lit by the house's sky (hemisphere) and fill lights, which have no shadows.
# Here they are added to the cool light with ambient occlusion, from baked normals and AO (js/main.js values).
world.light_settings.distance = 1.2
ao, _ = bake_pass('ao', COOL_SIZE, 'AO')
nrm, _ = bake_pass('normal', COOL_SIZE, 'NORMAL')
n = nrm * 2 - 1                                       # Blender axes: z is up
sky, ground = np.array(hexcol('#9a86e0')) * 1.15, np.array(hexcol('#1a1030')) * 1.15
fill_col = np.array(hexcol('#ff9ec8')) * 0.28
fd = np.array([-40.0, -60.0, 30.0]) / np.linalg.norm([-40.0, -60.0, 30.0])     # three (-40, 30, 60)
hemi = ground + (sky - ground) * (0.5 + 0.5 * n[..., 2:3])
fill = fill_col * np.clip((n * fd).sum(axis=2, keepdims=True), 0, None)
COOL_K = 0.5                                          # the runtime's cool exposure (KC in js/baked.js)
cool = cool + (hemi + fill) * ao[..., :1] / math.pi / COOL_K
cool, st_cool = encode(cool, secs)
save_png('cool', cool)
stats = {'warm': st_warm, 'cool': st_cool}
log('stats', json.dumps(stats))

# ------------------------------------------------------------------ split off the dissolving wall dressings and export
for m in me.materials:
    b = m.node_tree.nodes.get('BAKE')
    if b:
        m.node_tree.nodes.remove(b)
for ob in HELP + LIGHTS:
    bpy.data.objects.remove(ob, do_unlink=True)
names = {0: 'Hall_Main', 1: 'Hall_Back', 2: 'Hall_Left'}
bpy.ops.object.select_all(action='DESELECT')
HALL.select_set(True)
bpy.context.view_layer.objects.active = HALL
for g in (1, 2):
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(HALL.data)
    gl = bm.faces.layers.int['grp']
    for f in bm.faces:
        f.select_set(f[gl] == g)
    bm.select_flush_mode()
    bmesh.update_edit_mesh(HALL.data)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.selected_objects if o != HALL][0]
    new.name = names[g]
    new.data.name = names[g]
    new.select_set(False)
HALL.name = names[0]
HALL.data.name = names[0]
for ob in scene.objects:
    if ob.type == 'MESH':
        for a in [a.name for a in ob.data.attributes if a.name in ('grp', 'ceil')]:
            ob.data.attributes.remove(ob.data.attributes[a])
glb = os.path.join(OUT, 'grandhall.glb')
bpy.ops.export_scene.gltf(
    filepath=glb, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
    export_draco_position_quantization=14, export_draco_normal_quantization=8, export_draco_texcoord_quantization=12,
    export_extras=True, export_cameras=False, export_lights=False,
)
meta = dict(triangles=tris, materials=sorted(m.name for m in me.materials), flames=len(FLAMES), pipes=len(PIPES),
            samples=SAMPLES, warm=stats['warm'], cool=stats['cool'], seconds=round(time.time() - T0, 1))
with open(os.path.join(OUT, 'grandhall.json'), 'w') as f:
    json.dump(meta, f, indent=1)
log('DONE', json.dumps(meta))
