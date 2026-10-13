"""Shared toolkit for the Blender scripts that model and light-bake parts of the nook (see exterior.py).

Geometry is written in the site's three.js coordinates (y up); V() converts to Blender's z-up space and the
glTF exporter converts back. Every part is tagged with an export group, which becomes its own object in the
glb (so a facade can dissolve or a roof can float on its own), and optionally 'lowres', which halves its
lightmap texel density for surfaces that are rarely seen up close.

grand_hall.py predates this module and carries its own copy of these helpers.
"""
import bpy, bmesh, math, sys, os, json, time, contextlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

T0 = time.time()
def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

def args(defaults):
    """'-- --out assets --cool-size 1024' after Blender's own arguments; defaults give the types."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for k, v in defaults.items():
        flag = '--' + k.replace('_', '-')
        out[k] = type(v)(argv[argv.index(flag) + 1]) if flag in argv else v
    out['out'] = os.path.abspath(out['out'])
    os.makedirs(out['out'], exist_ok=True)
    return out

def V(x, y, z):
    return Vector((x, -z, y))

def reset_scene(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'
    except Exception as e:
        log('GPU unavailable, baking on the CPU:', e)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 2
    return scene

# ------------------------------------------------------------------ materials
def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexcol(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))
M = {}
def mat(name, color, rough=0.85):
    """Bake albedo; it should match the average colour of the texture the site paints on at runtime."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*hexcol(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0.0   # metals bake as diffuse; their sheen is added at runtime
    M[name] = m
    return m

# ------------------------------------------------------------------ tagged parts
OBJS, HELP, LIGHTS = [], [], []
GROUPS = ['main']
LIT = set()
_tag = {'grp': 0, 'lowres': 0}
def group(name, lowres=False, lit=False):
    """Every part made after this call goes into export group `name`. A lit group is exported without a
    lightmap for the site to light live (thin ironwork, which would only crowd the lightmap); it still shades
    the baked parts around it."""
    if name not in GROUPS:
        GROUPS.append(name)
    if lit:
        LIT.add(name)
    _tag['grp'] = GROUPS.index(name)
    _tag['lowres'] = int(lowres)

def finish(bm, m, name='part'):
    gl = bm.faces.layers.int.get('grp') or bm.faces.layers.int.new('grp')
    ll = bm.faces.layers.int.get('lowres') or bm.faces.layers.int.new('lowres')
    for f in bm.faces:
        f[gl] = _tag['grp']
        f[ll] = _tag['lowres']
        f.smooth = True               # edges sharper than the join's angle are split again
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    OBJS.append(ob)
    return ob

_THREE_TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

@contextlib.contextmanager
def frame(pos=(0, 0, 0), ry=0.0, rz=0.0, rx=0.0, s=1.0):
    """Parts made inside are placed the way a three.js group places its children: scaled by s, rotated
    (Euler XYZ, as three.js does) and moved to pos. Frames nest."""
    start = len(OBJS)
    yield
    m = Matrix.Translation(Vector(pos)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Scale(s, 4)
    mb = _THREE_TO_BLENDER @ m @ _THREE_TO_BLENDER.inverted()
    for ob in OBJS[start:]:
        ob.data.transform(mb)

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

def cyl(r1, r2, h, x, y, z, m, seg=12, rot=0.0):
    """Vertical cylinder or cone with its base at y; rot turns it about its axis."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(rot, 3, 'Z'))
    bmesh.ops.translate(bm, vec=V(x, y + h / 2, z), verts=bm.verts)
    return finish(bm, m, 'cyl')

def lathe(profile, x, y, z, m, seg=14, rot=0.0):
    """Solid of revolution. profile: [(radius, height)] bottom to top, starting and ending on the axis."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector((r, 0, h))) for r, h in profile]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=list(bm.verts) + list(bm.edges), cent=Vector((0, 0, 0)), axis=Vector((0, 0, 1)),
                   steps=seg, angle=math.tau, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(rot, 3, 'Z'))
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

def slab(poly, thick, m, toward=None):
    """A planar polygon (three coords, any winding) thickened by `thick` towards the point `toward`
    (e.g. the middle of the building) or, without it, along the polygon's own normal."""
    P = [Vector(p) for p in poly]
    n = (P[1] - P[0]).cross(P[2] - P[0]).normalized()
    if toward is not None and n.dot(Vector(toward) - P[0]) < 0:
        n = -n
    return prism([tuple(p) for p in P], tuple(n * thick), m)

def slab2d(pts, a0, a1, m, plane='xy', bevel=0.0, segs=2):
    """A closed outline of 2D points made solid: in plane 'xy' it is extruded along z from a0 to a1, in 'xz'
    (points are x, z) along y, and in 'zy' (points are z, y) along x. bevel rounds the edges round both faces."""
    bm = bmesh.new()
    P = {'xy': lambda u, v, w: V(u, v, w), 'xz': lambda u, v, w: V(u, w, v), 'zy': lambda u, v, w: V(w, v, u)}[plane]
    lo = [bm.verts.new(P(u, v, a0)) for u, v in pts]
    hi = [bm.verts.new(P(u, v, a1)) for u, v in pts]
    bm.faces.new(lo)
    bm.faces.new(list(reversed(hi)))
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel:
        ends = set(lo), set(hi)
        caps = [e for e in bm.edges if any(e.verts[0] in s and e.verts[1] in s for s in ends)]
        bmesh.ops.bevel(bm, geom=caps, offset=bevel, segments=segs, affect='EDGES', profile=0.5, clamp_overlap=True)
    return finish(bm, m, 'slab')

def rod(p0, p1, r0, m, r1=None, seg=8):
    """A cylinder (or tapered rod) from p0 to p1."""
    a, b = Vector(p0), Vector(p1)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r0 if r1 is None else r1, depth=(b - a).length)
    q = Vector((0, 0, 1)).rotation_difference(V(*(b - a)).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=bm.verts, vec=V(*((a + b) / 2)))
    return finish(bm, m, 'rod')

def torus(R, r, m, seg=18, ring=6):
    """A ring in the x-y plane round the z axis."""
    bm = bmesh.new()
    rows = [[bm.verts.new(V((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
             for b in (math.tau * j / ring for j in range(ring))] for a in (math.tau * i / seg for i in range(seg))]
    for i in range(seg):
        r0, r1 = rows[i], rows[(i + 1) % seg]
        for j in range(ring):
            k = (j + 1) % ring
            bm.faces.new((r0[j], r1[j], r1[k], r0[k]))
    return finish(bm, m, 'torus')

def dome(c, rx, ry, rz, m, seg=10, rings=4):
    """Half an ellipsoid sitting on y = c[1]: a grave's mound."""
    bm = bmesh.new()
    top = bm.verts.new(V(c[0], c[1] + ry, c[2]))
    rows = []
    for k in range(1, rings + 1):
        th = math.pi / 2 * k / rings
        rows.append([bm.verts.new(V(c[0] + rx * math.sin(th) * math.cos(f), c[1] + ry * math.cos(th), c[2] + rz * math.sin(th) * math.sin(f)))
                     for f in (math.tau * j / seg for j in range(seg))])
    for j in range(seg):
        bm.faces.new((top, rows[0][(j + 1) % seg], rows[0][j]))
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    bm.faces.new(list(reversed(rows[-1])))
    return finish(bm, m, 'dome')

def loft(rings, m):
    """A closed solid through rings of points (three coords, the same count in each), bottom to top: a skirt, a
    sheet over furniture."""
    bm = bmesh.new()
    vs = [[bm.verts.new(V(*p)) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(vs[0])))
    bm.faces.new(vs[-1])
    return finish(bm, m, 'loft')

def fence(x0, z0, x1, z1, y0, h, m, gap=0.22, posts=2.4):
    """Wrought-iron railing along an axis-aligned run: posts with ball caps, two rails, spear-topped bars."""
    L = math.hypot(x1 - x0, z1 - z0)
    ux, uz = (x1 - x0) / L, (z1 - z0) / L
    at = lambda t: (x0 + ux * t, z0 + uz * t)
    for yy in (y0 + 0.1, y0 + h - 0.2):
        a, b = at(0), at(L)
        box(min(a[0], b[0]) - 0.02, max(a[0], b[0]) + 0.02, yy, yy + 0.04, min(a[1], b[1]) - 0.02, max(a[1], b[1]) + 0.02, m)
    npost = max(1, round(L / posts))
    tposts = [L * i / npost for i in range(npost + 1)]
    for t in tposts:
        x, z = at(t)
        box(x - 0.045, x + 0.045, y0, y0 + h + 0.02, z - 0.045, z + 0.045, m)
        sphere(0.065, x, y0 + h + 0.08, z, m, seg=6)
    n = max(1, round(L / gap))
    for i in range(1, n):
        t = L * i / n
        if min(abs(t - p) for p in tposts) < 0.08:
            continue
        x, z = at(t)
        box(x - 0.01, x + 0.01, y0 + 0.02, y0 + h - 0.1, z - 0.01, z + 0.01, m)
        cyl(0.03, 0.0, 0.12, x, y0 + h - 0.1, z, m, seg=4, rot=math.pi / 4)

def empty(name, x, y, z, **props):
    ob = bpy.data.objects.new(name, None)
    ob.location = V(x, y, z)
    ob.empty_display_size = 0.05
    for k, v in props.items():
        ob[k] = v
    bpy.context.scene.collection.objects.link(ob)
    return ob

class Wall:
    """Local frame on a wall face: u runs along it, v is height, d is along the face's normal."""
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
    def obox(self, u0, u1, v0, v1, d0, d1, m):
        """A box aligned with the wall, for walls that are not axis-aligned (box() is world-aligned)."""
        return prism([self.p(u0, v0, d0), self.p(u1, v0, d0), self.p(u1, v1, d0), self.p(u0, v1, d0)],
                     tuple(self.n[i] * (d1 - d0) for i in range(3)), m)

def subtract(u0, u1, v0, v1, holes):
    """Rectangles covering [u0,u1]x[v0,v1] minus holes [(a,b,c,d,...)]."""
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

# ------------------------------------------------------------------ bake-only scenery and lights
BLOCK = None
def blocker(ob, keep_material=False, only=None):
    """Turn a part into bake-only scenery: it shades and bounces light but is not exported. only='warm' or
    'cool' keeps it out of the other layer's bake."""
    global BLOCK
    if BLOCK is None:
        BLOCK = mat('blocker', '#3a3444')
    OBJS.remove(ob)
    if not keep_material:
        ob.data.materials.clear()
        ob.data.materials.append(BLOCK)
    if only:
        ob['only'] = only
    HELP.append(ob)
    return ob

LIGHT_SPECS = []
def light(name, kind, xyz, color, power, size=0.1, size_y=None, aim=None, group='warm', shadow=True, angle=None):
    """aim: the direction (three coords) the light shines along, for suns and area lights."""
    LIGHT_SPECS.append(dict(name=name, kind=kind, xyz=list(xyz), color=list(color), power=power, size=size, size_y=size_y,
                            aim=list(aim) if aim is not None else None, group=group, shadow=shadow, angle=angle))
    ld = bpy.data.lights.new(name, kind)
    ld.color = color
    ld.energy = power
    ld.use_shadow = shadow
    if kind == 'AREA':
        ld.shape = 'RECTANGLE' if size_y else 'SQUARE'
        ld.size = size
        if size_y:
            ld.size_y = size_y
    elif kind == 'SUN':
        ld.angle = angle if angle is not None else math.radians(1.0)
    else:
        ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = V(*xyz)
    if aim is not None:
        ob.rotation_euler = V(*aim).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(ob)
    ob['group'] = group
    LIGHTS.append(ob)
    return ob

def save_lights(path, world):
    """Write every light made so far, and the sky's colours, so another set can be lit exactly the same way."""
    with open(path, 'w') as f:
        json.dump(dict(world=[list(c) for c in world], lights=LIGHT_SPECS), f, indent=1)

def load_lights(path):
    """Recreate the lights saved by save_lights(); returns the sky's (top, bottom) colours."""
    with open(path) as f:
        d = json.load(f)
    for spec in d['lights']:
        light(**spec)
    return [tuple(c) for c in d['world']]

def scenery(path, keep=None):
    """Load another set's glb as bake-only scenery that keeps its materials (for its shadows and bounce)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.data.objects if o not in before]
    for ob in obs:                                 # world-space vertices, as the buried-face test expects
        if ob.type == 'MESH':
            ob.data.transform(ob.matrix_world)
    for ob in obs:
        if ob.type == 'MESH':
            ob.parent = None
            ob.matrix_world = Matrix.Identity(4)
    for ob in obs:
        if ob.type == 'MESH' and (keep is None or keep(ob.name)):
            HELP.append(ob)
        else:
            bpy.data.objects.remove(ob, do_unlink=True)
    return [o for o in HELP if o in obs]

def sky(top, bottom, strength=1.0):
    """A world that is `top` overhead and `bottom` underfoot, blended by height (the site's hemisphere light)."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new('night')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get('Background')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    rng = nt.nodes.new('ShaderNodeMapRange')
    rng.inputs['From Min'].default_value = -1.0
    rng.inputs['From Max'].default_value = 1.0
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    sock = lambda socks, ident: next(s for s in socks if s.identifier == ident)
    sock(mix.inputs, 'A_Color').default_value = (*bottom, 1)
    sock(mix.inputs, 'B_Color').default_value = (*top, 1)
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], rng.inputs['Value'])
    nt.links.new(rng.outputs['Result'], sock(mix.inputs, 'Factor_Float'))
    nt.links.new(sock(mix.outputs, 'Result_Color'), bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    return world

def dark_world():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('dark')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.0
    return world

# ------------------------------------------------------------------ join, lightmap UVs, bake, split, export
def split_group(obj, gi, name):
    """Move the faces of export group gi out of obj into a new object called name; False if it has none."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(obj.data)
    gl = bm.faces.layers.int['grp']
    any_face = False
    for f in bm.faces:
        sel = f[gl] == gi
        f.select_set(sel)
        any_face |= sel
    bm.select_flush_mode()
    bmesh.update_edit_mesh(obj.data)
    if any_face:
        bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    if any_face:
        new = [o for o in bpy.context.selected_objects if o != obj][0]
        new.name = new.data.name = name
        new.select_set(False)
    return any_face

def build(name, prefix, out, size, cool_size, samples, hidden=None, cool_world=None, ambient=None, extra=None):
    """Join every part, drop faces nobody can see, unwrap, bake the 'warm' and 'cool' light groups, split
    the export groups into objects named prefix_group and write <name>.glb, <name>_warm.png,
    <name>_cool.png and <name>.json.
    hidden(normal, centre) -> bool removes further faces (three coords); cool_world is lit only for the
    cool bake; ambient(nrm, ao) -> rgb is added to the cool light (both baked at cool_size)."""
    scene = bpy.context.scene
    log('parts:', len(OBJS))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in OBJS:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = OBJS[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    # faces buried inside or pressed against other parts or the bake-only scenery: every sample point just in
    # front of them is inside a solid
    hb = bmesh.new()
    for h in HELP:
        hb.from_mesh(h.data)
    bvhs = [BVHTree.FromBMesh(bm), BVHTree.FromBMesh(hb)]
    probes = [Vector((0.31, 0.53, 0.79)).normalized(), Vector((-0.71, 0.19, -0.68)).normalized(), Vector((0.12, -0.88, 0.45)).normalized()]
    def inside(p):
        for bvh in bvhs:
            votes = 0
            for d in probes:
                hit, nrm, _, _ = bvh.ray_cast(p, d)
                if hit is not None and nrm.dot(d) > 0:
                    votes += 1
            if votes >= 2:
                return True
        return False
    dead = set()
    for f in bm.faces:
        c, n = f.calc_center_median(), f.normal
        vs = list(f.verts)
        vs = vs[::max(1, len(vs) // 8)]
        pts = [c] + [v.co + (c - v.co).normalized() * min(0.01, (c - v.co).length * 0.5) for v in vs]
        pts += [(a.co + b.co) / 2 for a, b in zip(vs, vs[1:] + vs[:1])]
        if f.calc_area() > 0.05:                   # and across a big face, which bands or mouldings can cover only in part
            co = [l.vert.co for l in f.loops]
            for k in range(1, len(co) - 1):
                a, b, d = co[0], co[k], co[k + 1]
                pts += [a + (b - a) * u + (d - a) * v for u, v in ((0.2, 0.2), (0.6, 0.2), (0.2, 0.6), (0.33, 0.33), (0.1, 0.45), (0.45, 0.1))]
        if all(inside(p + n * 0.003) for p in pts):
            dead.add(f)
    buried = len(dead)
    if hidden:
        for f in bm.faces:
            n, c = f.normal, f.calc_center_median()
            if f not in dead and hidden((n.x, n.z, -n.y), (c.x, c.z, -c.y)):
                dead.add(f)
    bmesh.ops.delete(bm, geom=list(dead), context='FACES')
    bm.to_mesh(me)
    bm.free()
    hb.free()
    me.set_sharp_from_angle(angle=math.radians(50))
    log(f'removed {buried} buried faces and {len(dead) - buried} more hidden ones')
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='LM')
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    log(f'joined: {len(me.polygons)} faces ({tris} triangles), {len(me.materials)} materials')
    for gname in [g for g in GROUPS if g in LIT]:      # lit groups leave before unwrapping and aren't baked
        if split_group(obj, GROUPS.index(gname), f'{prefix}_{gname}'):
            new = bpy.data.objects[f'{prefix}_{gname}']
            while new.data.uv_layers:
                new.data.uv_layers.remove(new.data.uv_layers[0])
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bm = bmesh.from_edit_mesh(me)
    uvl = bm.loops.layers.uv['LM']
    ll = bm.faces.layers.int['lowres']
    for f in bm.faces:
        if f[ll]:
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

    dark = dark_world()
    def bake_pass(tag, px, kind, grp=None, world=None):
        img = bpy.data.images.new(f'lm_{tag}', px, px, float_buffer=True, alpha=False)
        for m in me.materials:
            nt = m.node_tree
            node = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE'
            node.image = img
            nt.nodes.active = node
        for L in LIGHTS:
            L.hide_render = (L['group'] != grp)
        for h in HELP:
            h.hide_render = h.get('only', grp) != grp
        scene.world = world or dark
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        t = time.time()
        if kind == 'AO':
            bpy.ops.object.bake(type='AO', margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
        elif kind == 'NORMAL':
            bpy.ops.object.bake(type='NORMAL', normal_space='OBJECT', margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
        else:
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
        secs = time.time() - t
        a = np.empty(px * px * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        rgb = a.reshape(px, px, 4)[..., :3]
        k = np.array([1, 4, 6, 4, 1], np.float32)
        k /= k.sum()
        pad = np.pad(rgb, ((2, 2), (2, 2), (0, 0)), mode='edge')       # light 5x5 binomial denoise
        tmp = sum(pad[:, i:i + px, :] * k[i] for i in range(5))
        log(f'baked {tag} in {secs:.1f}s')
        return sum(tmp[i:i + px, :, :] * k[i] for i in range(5)), secs
    def encode(rgb, secs):
        """sqrt(irradiance / scale) keeps precision in the shadows of an 8-bit image"""
        lum = rgb.mean(axis=2)
        lit = lum[lum > 1e-5]
        scale = float(max(np.percentile(lit, 99.7) * 1.15, 1e-3)) if lit.size else 1.0
        st = dict(scale=scale, size=rgb.shape[0], seconds=round(secs, 1), mean=float(lit.mean()) if lit.size else 0,
                  p50=float(np.percentile(lit, 50)) if lit.size else 0, clipped=float((lum > scale).mean()))
        return np.sqrt(np.clip(rgb / scale, 0, 1)), st
    def save_png(tag, rgb):
        px = rgb.shape[0]
        img = bpy.data.images.new(f'out_{tag}', px, px, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        o = np.ones((px, px, 4), np.float32)
        o[..., :3] = rgb
        img.pixels.foreach_set(o.ravel())
        img.filepath_raw = os.path.join(out, f'{name}_{tag}.png')
        img.file_format = 'PNG'
        img.save()

    warm, secs = bake_pass('warm', size, 'DIFFUSE', 'warm')
    warm, st_warm = encode(warm, secs)
    save_png('warm', warm)
    cool, secs = bake_pass('cool', cool_size, 'DIFFUSE', 'cool', cool_world)
    if ambient:
        scene.world = dark
        dark.light_settings.distance = 1.2
        ao, _ = bake_pass('ao', cool_size, 'AO')
        nrm, _ = bake_pass('normal', cool_size, 'NORMAL')
        cool = cool + ambient(nrm * 2 - 1, ao[..., :1])
    cool, st_cool = encode(cool, secs)
    save_png('cool', cool)
    stats = {'warm': st_warm, 'cool': st_cool}
    log('stats', json.dumps(stats))

    for m in me.materials:
        b = m.node_tree.nodes.get('BAKE')
        if b:
            m.node_tree.nodes.remove(b)
    for ob in HELP + LIGHTS:
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for gi, gname in enumerate(GROUPS):
        if gi and gname not in LIT:
            split_group(obj, gi, f'{prefix}_{gname}')
    obj.name = obj.data.name = f'{prefix}_{GROUPS[0]}'
    if not obj.data.polygons:
        bpy.data.objects.remove(obj, do_unlink=True)
    for ob in scene.objects:
        if ob.type == 'MESH':
            for a in [a.name for a in ob.data.attributes if a.name in ('grp', 'lowres')]:
                ob.data.attributes.remove(ob.data.attributes[a])
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out, f'{name}.glb'), export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
        export_draco_position_quantization=14, export_draco_normal_quantization=8, export_draco_texcoord_quantization=12,
        export_extras=True, export_cameras=False, export_lights=False,
    )
    meta = dict(triangles=tris, groups=GROUPS, lit=sorted(LIT), materials=sorted(m.name for m in me.materials), samples=samples,
                warm=stats['warm'], cool=stats['cool'], seconds=round(time.time() - T0, 1), **(extra or {}))
    with open(os.path.join(out, f'{name}.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    log('DONE', json.dumps(meta))
