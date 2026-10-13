"""Model the nook's solid figures as smooth sculpted shapes and export them for the site to light live: the
graveyard's caretaker and his trembling dog (js/outside.js), the marble busts that sing in the graveyard and watch
you in the library, and the raven (js/props.js). They move, so instead of a lightmap each one carries its ambient
occlusion in its vertex colours (baked with Cycles), which keeps folds, curls, armpits and the shadow under a hat
brim dark whatever the lights do.

    blender -b --factory-startup -P blender/figures.py -- --out blender/build

Writes figures.glb with one object per moving part, each in the frame the site animates it in:
- Fig_caretaker-legs (the caretaker's group), Fig_caretaker-torso (its pivot at the hips, before the stoop),
  Fig_dog-body (the dog's group) and Fig_dog-head (its pivot at the top of the neck);
- Fig_bust-body-<coat|coat-bow|gown|toga> (the bust's group, with its socle), and in the frame of the turning head:
  Fig_bust-head (shared by every bust), Fig_bust-hair-<short|fringe|curls|bun|wavy>, Fig_bust-laurel,
  Fig_bust-hat-<top|bowler>, and Fig_bust-face, the shell the singing busts' painted faces are projected onto;
- Fig_raven-body (the raven's group), Fig_raven-head (its pivot) and Fig_raven-wing-<l|r> (their pivots, which the
  site rolls by 0.2 at rest).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy, random
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree
import kit
from kit import V, hexcol

A = kit.args({'out': 'assets', 'samples': 64})
kit.reset_scene(A['samples'])
MATS = {}
for name, col, rough in [('coat', '#4a3a2e', 0.9), ('trousers', '#2a2420', 0.9), ('boots', '#141016', 0.5), ('skin', '#d8b896', 0.7),
                         ('nose', '#c8907a', 0.6), ('hat', '#2a2018', 0.9), ('scarf', '#7a1a22', 0.9), ('gloves', '#3a3030', 0.8),
                         ('brows', '#8a8580', 0.9), ('eyes', '#120d12', 0.3), ('fur', '#4e463e', 0.95), ('dog_nose', '#15101a', 0.4),
                         ('marble', '#bdb5c4', 0.4), ('hat_black', '#16131a', 0.45), ('bust_face', '#ffffff', 0.6),
                         ('raven', '#15121a', 0.42), ('beak', '#2a2530', 0.35), ('raven_eye', '#ff3030', 0.4)]:
    MATS[name] = kit.mat(name, col, rough)
MATS['raven'].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.15   # a little sheen on the feathers

# ------------------------------------------------------------------ shape helpers (three coords)
def frames(cs):
    """Rotation-minimising (tangent, normal, binormal) frames along a polyline."""
    n = len(cs)
    ts = [(cs[min(n - 1, i + 1)] - cs[max(0, i - 1)]).normalized() for i in range(n)]
    nrm = ts[0].orthogonal().normalized()
    out = []
    for t in ts:
        nrm = (nrm - t * nrm.dot(t)).normalized()
        out.append((t, nrm, t.cross(nrm)))
    return out

def loft(rings, m, name='part', subdiv=1):
    """A closed smooth solid through rings of points (each ring wound the same way), capped at both ends,
    smoothed by subdivision."""
    bm = bmesh.new()
    vs = [[bm.verts.new(V(*p)) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new((a[j], a[k], b[k], b[j]))
    for ring, flip in ((vs[0], True), (vs[-1], False)):
        c = sum((v.co for v in ring), Vector()) / n
        cv = bm.verts.new(c)
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new((ring[k], ring[j], cv) if flip else (ring[j], ring[k], cv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(m)
    if subdiv:
        mod = ob.modifiers.new('sub', 'SUBSURF')
        mod.levels = mod.render_levels = subdiv
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier='sub')
    for p in me.polygons:
        p.use_smooth = True
    return ob

def ellipse(c, rx, rz, n=12, y_axis=False, ry=None, phase=0.0, wobble=None, sq=2.0):
    """A horizontal ring round the point c (or, with y_axis, an upright ring facing along z, rx wide and ry high);
    sq above 2 squares it off."""
    pts = []
    for j in range(n):
        t = math.tau * j / n + phase
        k = 1 + (wobble(t) if wobble else 0)
        s, co = math.sin(t), math.cos(t)
        s, co = math.copysign(abs(s) ** (2 / sq), s), math.copysign(abs(co) ** (2 / sq), co)
        if y_axis:
            pts.append(Vector((c[0] + s * rx * k, c[1] + co * ry * k, c[2])))
        else:
            pts.append(Vector((c[0] + s * rx * k, c[1], c[2] + co * rz * k)))
    return pts

def tube(path, radii, m, n=10, name='limb', subdiv=1, flat=1.0):
    """A limb along a path (three coords) with a radius at each point; flat squashes it across its normal."""
    path = [Vector(p) for p in path]
    rings = []
    for c, r, (t, nn, bb) in zip(path, radii, frames(path)):
        rings.append([c + nn * math.cos(a) * r * flat + bb * math.sin(a) * r for a in (math.tau * j / n for j in range(n))])
    return loft(rings, m, name, subdiv)

def strap(path, widths, thick, m, normal, n=10, name='strap', subdiv=1):
    """A flat band along a path, its flat side facing normal(p), widths across it and thick through it (a number or
    one per point): lapels, folds of cloth, feathers, a beak."""
    path = [Vector(p) for p in path]
    rings = []
    for i, c in enumerate(path):
        t = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        nn = Vector(normal(c))
        nn = (nn - t * nn.dot(t)).normalized()
        side = t.cross(nn)
        th = thick[i] if isinstance(thick, (list, tuple)) else thick
        rings.append([c + side * math.cos(a) * widths[i] + nn * math.sin(a) * th for a in (math.tau * j / n for j in range(n))])
    return loft(rings, m, name, subdiv)

def leaf(base, direction, normal, length, width, m, name='leaf'):
    """A pointed leaf from base along direction, lying across normal and curling up a little toward its tip."""
    d = Vector(direction).normalized()
    nn = Vector(normal)
    nn = (nn - d * nn.dot(d)).normalized()
    s = d.cross(nn)
    rings = []
    for i in range(1, 6):
        u = i / 6
        w = width * math.sin(math.pi * u) ** 0.8
        c = Vector(base) + d * length * u + nn * 0.15 * length * u * u
        rings.append([c + s * math.cos(a) * w + nn * math.sin(a) * w * 0.18 for a in (math.tau * j / 6 for j in range(6))])
    return loft(rings, m, name, subdiv=0)

def blob(c, r, m, name='blob', subdiv=1, rot=None):
    """An ellipsoid with radii r (x, y, z), optionally turned by the Euler angles rot (three coords)."""
    rings = []
    R = Matrix.Identity(3)
    if rot:
        R = (Matrix.Rotation(rot[1], 3, 'Y') @ Matrix.Rotation(rot[0], 3, 'X') @ Matrix.Rotation(rot[2], 3, 'Z'))
    for i in range(1, 6):
        th = math.pi * i / 6
        rings.append([Vector(c) + R @ Vector((math.sin(th) * math.sin(a) * r[0], math.cos(th) * r[1], math.sin(th) * math.cos(a) * r[2]))
                      for a in (math.tau * j / 10 for j in range(10))])
    return loft(rings, m, name, subdiv)

def lathe_shape(profile, c, m, n=16, name='lathe', subdiv=1, warp=None):
    """A solid of revolution round a vertical axis through c; profile is [(radius, height)] from bottom to top.
    warp(point, angle) can bend the result (a hat's drooping brim)."""
    rings = []
    for r, h in profile:
        ring = []
        for j in range(n):
            a = math.tau * j / n
            p = Vector((c[0] + math.sin(a) * r, c[1] + h, c[2] + math.cos(a) * r))
            ring.append(warp(p, a) if warp else p)
        rings.append(ring)
    return loft(rings, m, name, subdiv)

MB = 1 / 0.574                                         # a lone metaball's surface sits at 0.574 of its radius
TO_B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))       # three coords -> Blender's
def mball(name, elems, res, m, ratio, smooth=2):
    """Soft forms that fuse like clay: metaball elements (three coords), polygonised, smoothed and simplified to about
    ratio of their triangles. Each element is (kind, centre, size[, rotation, negative, stiffness]): a BALL's size is
    its surface radius, an ELLIPSOID's its surface semi-axes; a CAPSULE runs between the two points given as its
    centre, size thick. Negative elements carve."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name, mb)
    bpy.context.scene.collection.objects.link(ob)
    for el in elems:
        kind, c, size = el[:3]
        rot, neg, stiff = (list(el[3:]) + [None, False, 2.0][len(el) - 3:])[:3]
        e = mb.elements.new(type=kind)
        e.stiffness, e.use_negative = stiff, neg
        if kind == 'BALL':
            e.co, e.radius = V(*c), size * MB
        elif kind == 'ELLIPSOID':
            e.co, e.radius = V(*c), MB
            e.size_x, e.size_y, e.size_z = size[0], size[2], size[1]
            if rot:
                e.rotation = (TO_B @ Euler(rot, 'XYZ').to_matrix() @ TO_B.inverted()).to_quaternion()
        else:
            p0, p1 = Vector(c[0]), Vector(c[1])
            e.co, e.radius, e.size_x = V(*((p0 + p1) / 2)), size * MB, (p1 - p0).length / 2
            e.rotation = Vector((1, 0, 0)).rotation_difference(V(*(p1 - p0)).normalized())
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    if smooth:                                         # iron out the polygoniser's grid before simplifying
        mod = ob.modifiers.new('smooth', 'SMOOTH')
        mod.factor, mod.iterations = 0.5, smooth
        bpy.ops.object.modifier_apply(modifier='smooth')
    mod = ob.modifiers.new('decimate', 'DECIMATE')
    mod.ratio, mod.use_collapse_triangulate = ratio, True
    bpy.ops.object.modifier_apply(modifier='decimate')
    for poly in ob.data.polygons:
        poly.use_smooth = True
    ob.data.materials.append(m)
    return ob

def three(v):
    return Vector((v.x, v.z, -v.y))

def simplify(ob, ratio):
    """Fewer triangles where the surface is flattest."""
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    mod = ob.modifiers.new('decimate', 'DECIMATE')
    mod.ratio, mod.use_collapse_triangulate = ratio, True
    bpy.ops.object.modifier_apply(modifier='decimate')
    return ob

PARTS = {}
def part(name, obs):
    """Join objects into one export object."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = f'Fig_{name}'
    PARTS[name] = ob
    return ob

# ------------------------------------------------------------------ the caretaker's legs (frame: the caretaker group)
legs = []
for side in (-1, 1):
    legs.append(tube([(side * 0.11, 0.78, 0.0), (side * 0.1, 0.6, 0.03), (side * 0.085, 0.4, 0.075), (side * 0.1, 0.24, 0.04), (side * 0.11, 0.12, 0.0)],
                     [0.088, 0.08, 0.066, 0.058, 0.055], MATS['trousers'], n=10, name='leg'))
    legs.append(loft([ellipse((side * 0.11, y, z), rx, rz, 12) for y, z, rx, rz in
                      ((0.0, 0.06, 0.07, 0.15), (0.03, 0.06, 0.077, 0.16), (0.075, 0.035, 0.072, 0.12), (0.12, 0.0, 0.062, 0.075), (0.17, 0.0, 0.058, 0.06))],
                     MATS['boots'], 'boot'))
part('caretaker-legs', legs)

# ------------------------------------------------------------------ his torso (frame: the hips; js/outside.js stoops it forward)
torso = []
coat = [(-0.48, 0.31, 0.27, 0.0), (-0.3, 0.285, 0.245, 0.0), (-0.1, 0.255, 0.22, 0.0), (0.05, 0.24, 0.2, 0.0), (0.22, 0.25, 0.2, 0.0),
        (0.45, 0.275, 0.2, 0.01), (0.6, 0.295, 0.185, 0.0), (0.7, 0.26, 0.165, -0.01), (0.77, 0.14, 0.12, 0.0)]
torso.append(loft([ellipse((0, y, z), rx, rz, 16, wobble=(lambda t, y=y: 0.04 * math.sin(6 * t) * max(0.0, -y) / 0.48)) for y, rx, rz, z in coat],
                  MATS['coat'], 'coat'))
torso.append(lathe_shape([(0.13, 0.0), (0.15, 0.04), (0.165, 0.08), (0.17, 0.1)], (0, 0.72, -0.015), MATS['coat'], 16, 'collar'))
loop = [(math.sin(t) * 0.145, 0.8 + 0.012 * math.sin(3 * t), math.cos(t) * 0.13 + 0.01) for t in (math.tau * j / 14 for j in range(15))]
torso.append(tube(loop, [0.045 + 0.008 * math.sin(5 * j) for j in range(15)], MATS['scarf'], n=8, name='scarf'))   # wound round the neck
torso.append(tube([(-0.06, 0.79, 0.15), (-0.1, 0.62, 0.21), (-0.11, 0.44, 0.22)], [0.045, 0.04, 0.035], MATS['scarf'], n=8, name='scarf-tail', flat=0.45))
# the head: long, with a big nose, bushy brows, ears, and a mouth open in fright
torso.append(blob((0, 1.03, 0.075), (0.15, 0.18, 0.16), MATS['skin'], 'skull'))
torso.append(blob((0, 0.94, 0.12), (0.11, 0.07, 0.1), MATS['skin'], 'jaw'))
torso.append(blob((0, 0.995, 0.235), (0.045, 0.06, 0.065), MATS['nose'], 'nose', rot=(0.35, 0, 0)))
for side in (-1, 1):
    torso.append(blob((side * 0.058, 1.04, 0.205), (0.024, 0.026, 0.016), MATS['eyes'], 'eye', subdiv=0))
    torso.append(blob((side * 0.062, 1.08, 0.2), (0.048, 0.017, 0.028), MATS['brows'], 'brow', subdiv=0, rot=(0, 0, side * 0.28)))
    torso.append(blob((side * 0.152, 1.025, 0.06), (0.022, 0.05, 0.038), MATS['skin'], 'ear'))
torso.append(blob((0, 0.925, 0.215), (0.035, 0.022, 0.014), MATS['eyes'], 'mouth', subdiv=0))
# a battered slouch hat, its brim drooping front and back
droop = lambda p, a: Vector((p.x, p.y - 0.045 * max(0.0, (p - Vector((0, p.y, 0.06))).length - 0.16) / 0.14 * math.cos(a) ** 2, p.z))
torso.append(lathe_shape([(0.12, 0.0), (0.28, -0.005), (0.29, 0.015), (0.13, 0.03)], (0, 1.13, 0.06), MATS['hat'], 20, 'brim', warp=droop))
torso.append(lathe_shape([(0.155, 0.0), (0.16, 0.08), (0.145, 0.16), (0.12, 0.19), (0.06, 0.17), (0.0, 0.16)], (0, 1.145, 0.06), MATS['hat'], 16, 'crown'))
# sleeves: the right hand holds the lantern out (js/outside.js hangs it at 0.24, 0.2, 0.42), the left clutches his coat
for side, path in ((1, [(0.26, 0.68, 0.0), (0.34, 0.47, 0.1), (0.33, 0.42, 0.22), (0.27, 0.58, 0.37)]),
                   (-1, [(-0.26, 0.68, 0.0), (-0.33, 0.45, 0.08), (-0.25, 0.42, 0.2), (-0.12, 0.49, 0.24)])):
    torso.append(tube(path, [0.078, 0.072, 0.066, 0.07], MATS['coat'], n=10, name='sleeve'))
    end = Vector(path[-1])
    d = (end - Vector(path[-2])).normalized()
    fist = end + d * 0.05
    torso.append(blob(tuple(fist), (0.05, 0.055, 0.06), MATS['gloves'], 'glove'))
    torso.append(blob(tuple(fist + Vector((-side * 0.035, 0.02, 0.02))), (0.022, 0.035, 0.022), MATS['gloves'], 'thumb', subdiv=0))
part('caretaker-torso', torso)

# ------------------------------------------------------------------ the dog's body (frame: the dog group; it faces +z)
dog = []
spine = [(-0.33, 0.44, 0.055, 0.06), (-0.27, 0.45, 0.083, 0.095), (-0.12, 0.455, 0.078, 0.088), (0.03, 0.44, 0.095, 0.13), (0.16, 0.465, 0.09, 0.12),
         (0.25, 0.52, 0.066, 0.08), (0.31, 0.585, 0.052, 0.058), (0.34, 0.62, 0.045, 0.05)]
dog.append(loft([ellipse((0, y, z), rx, 0, 12, y_axis=True, ry=ry) for z, y, rx, ry in spine], MATS['fur'], 'body'))
for side in (-1, 1):
    dog.append(tube([(side * 0.055, 0.42, 0.16), (side * 0.058, 0.24, 0.175), (side * 0.055, 0.05, 0.18)], [0.032, 0.024, 0.021], MATS['fur'], n=8, name='front-leg'))
    dog.append(tube([(side * 0.06, 0.44, -0.2), (side * 0.06, 0.3, -0.25), (side * 0.056, 0.17, -0.29), (side * 0.054, 0.05, -0.24)], [0.045, 0.034, 0.022, 0.02],
                    MATS['fur'], n=8, name='hind-leg'))
    for z in (0.195, -0.225):
        dog.append(blob((side * 0.056, 0.022, z), (0.028, 0.022, 0.044), MATS['fur'], 'paw', subdiv=0))
dog.append(tube([(0, 0.43, -0.33), (0, 0.32, -0.37), (0, 0.22, -0.31), (0, 0.17, -0.2)], [0.022, 0.018, 0.013, 0.008], MATS['fur'], n=8, name='tail'))   # tucked under, scared
part('dog-body', dog)

# ------------------------------------------------------------------ its head (frame: the top of the neck, at 0, 0.6, 0.32 on the dog)
head = []
head.append(blob((0, 0.035, 0.02), (0.066, 0.064, 0.075), MATS['fur'], 'skull'))
head.append(tube([(0, 0.02, 0.05), (0, 0.005, 0.13), (0, -0.005, 0.2)], [0.042, 0.034, 0.026], MATS['fur'], n=10, name='snout'))
head.append(blob((0, 0.0, 0.205), (0.022, 0.018, 0.017), MATS['dog_nose'], 'nose', subdiv=0))
for side in (-1, 1):
    head.append(blob((side * 0.034, 0.05, 0.078), (0.013, 0.014, 0.01), MATS['eyes'], 'eye', subdiv=0))
    head.append(blob((side * 0.062, -0.015, -0.005), (0.014, 0.062, 0.036), MATS['fur'], 'ear', rot=(0.25, 0, side * 0.35)))   # flat back
part('dog-head', head)

# ------------------------------------------------------------------ the busts (js/props.js bust): one head, four bodies
# The head's frame is its pivot, 0.6 above the bust's base, where js/outside.js bobs and sways it as it sings and
# js/rooms.js turns it to watch you. Its eyes and mouth sit where the singing busts' painted faces put theirs.
E, B, CAP = 'ELLIPSOID', 'BALL', 'CAPSULE'
marble = MATS['marble']
HEAD_MB = [
    (E, (0, 0.065, -0.03), (0.183, 0.19, 0.2)),                # cranium
    (E, (0, 0.1, 0.075), (0.148, 0.12, 0.115)),                # forehead
    (E, (0, -0.02, 0.065), (0.142, 0.15, 0.135)),              # face
    (E, (0, -0.125, 0.06), (0.13, 0.092, 0.112)),              # jaw
    (E, (0, -0.19, 0.138), (0.052, 0.042, 0.045)),             # chin
    (B, (0.086, 0.0, 0.13), 0.046), (B, (-0.086, 0.0, 0.13), 0.046),        # cheekbones
    (CAP, ((0.022, 0.08, 0.2), (0.105, 0.09, 0.163)), 0.02), (CAP, ((-0.022, 0.08, 0.2), (-0.105, 0.09, 0.163)), 0.02),   # brows
    (CAP, ((0, 0.058, 0.205), (0, -0.03, 0.238)), 0.02),       # nose
    (B, (0, -0.04, 0.24), 0.023),
    (B, (0.021, -0.054, 0.222), 0.014), (B, (-0.021, -0.054, 0.222), 0.014),
    (E, (0, -0.113, 0.204), (0.034, 0.011, 0.016)),           # lips, parted where the singing mouth is painted
    (E, (0, -0.144, 0.198), (0.03, 0.011, 0.016)),
    (B, (0.066, 0.035, 0.182), 0.032, None, False, 2.8), (B, (-0.066, 0.035, 0.182), 0.032, None, False, 2.8),   # eyes
    (CAP, ((0.042, 0.055, 0.207), (0.093, 0.053, 0.192)), 0.01, None, False, 3.0), (CAP, ((-0.042, 0.055, 0.207), (-0.093, 0.053, 0.192)), 0.01, None, False, 3.0),
    (CAP, ((0.046, 0.016, 0.205), (0.088, 0.02, 0.194)), 0.007, None, False, 2.4), (CAP, ((-0.046, 0.016, 0.205), (-0.088, 0.02, 0.194)), 0.007, None, False, 2.4),
    (E, (0.068, 0.07, 0.2), (0.03, 0.011, 0.016), None, True, 1.2), (E, (-0.068, 0.07, 0.2), (0.03, 0.011, 0.016), None, True, 1.2),
    (B, (0.066, 0.035, 0.221), 0.008, None, True, 3.0), (B, (-0.066, 0.035, 0.221), 0.008, None, True, 3.0),   # carved pupils
    (E, (0.188, 0.005, 0.0), (0.02, 0.055, 0.033)), (E, (-0.188, 0.005, 0.0), (0.02, 0.055, 0.033)),   # ears
    (CAP, ((0, -0.13, -0.035), (0, -0.37, -0.045)), 0.086),     # neck, down into the chest
]
bust_head = mball('MBhead', HEAD_MB, 0.0045, marble, 0.055, smooth=4)

class Scalp:
    """Points on the head's surface (three coords) with their normals, found by casting out from inside the skull at a
    polar angle th from the crown and an azimuth ph from the front."""
    def __init__(self, h):
        self.bvh = BVHTree.FromObject(h, bpy.context.evaluated_depsgraph_get())
        self.c = Vector((0, 0.06, -0.03))
    def at(self, th, ph):
        d = Vector((math.sin(th) * math.sin(ph), math.cos(th), math.sin(th) * math.cos(ph)))
        hit = self.bvh.ray_cast(V(*self.c), V(*d))
        return (three(hit[0]), three(hit[1]).normalized()) if hit[0] else (None, None)
    def flow(self, th, ph):                             # the way hair falls from the crown
        p0, _ = self.at(th, ph)
        p1, _ = self.at(th + 0.02, ph)
        return (p1 - p0).normalized() if p0 and p1 else Vector((0, -1, 0))
scalp = Scalp(bust_head)
def hairline(ph, front=46, back=112):                   # degrees from the crown: forehead, temples, nape
    return math.radians(front + (back - front) * (1 - math.cos(ph)) / 2)
def scalp_grid(step, front, back, jitter=0.0, rnd=None):
    out = []
    th = math.radians(4)
    while True:
        ring = max(1, int(round(360 * math.sin(th) / step)))
        hit = False
        for j in range(ring):
            t, ph = th, math.tau * (j + 0.5 * (len(out) % 2)) / ring - math.pi
            if rnd:
                t += rnd.uniform(-jitter, jitter)
                ph += rnd.uniform(-jitter, jitter) / max(0.3, math.sin(th))
            if t <= hairline(ph, front, back):
                out.append((t, ph))
                hit = True
        th += math.radians(step)
        if not hit and th > math.radians(back):
            return out

def hair(style):
    """short: combed locks; fringe: just the part below a hat; curls; bun: smooth, parted, with waves over the temples
    and a twisted bun; wavy: longer locks down to the nape, under the laurel."""
    rnd = random.Random({'short': 1, 'fringe': 1, 'curls': 2, 'bun': 3, 'wavy': 4}[style])
    els = []
    if style in ('short', 'fringe'):
        for th, ph in scalp_grid(13, 48, 108, 0.04, rnd):
            if style == 'fringe' and th < math.radians(58):
                continue
            p, n = scalp.at(th, ph)
            if not p:
                continue
            f = scalp.flow(th, ph)
            room = min(1.0, max(0.0, (hairline(ph, 48, 108) - th) / math.radians(14)))   # shorter locks at the hairline
            c = p + n * (0.012 if style == 'short' else 0.016) - f * 0.02 * (1 - room)
            els.append((CAP, (tuple(c - f * 0.022), tuple(c + f * 0.022 * room)), 0.02, None, False, 2.2))
        for sd in (-1, 1):                                  # sideburns
            els.append((CAP, ((sd * 0.172, 0.085, 0.055), (sd * 0.178, 0.0, 0.07)), 0.017))
    elif style == 'curls':
        for th, ph in scalp_grid(11, 44, 114, 0.05, rnd):
            p, n = scalp.at(th, ph)
            if p:
                els.append((B, tuple(p + n * 0.016), rnd.uniform(0.022, 0.028), None, False, 3.0))
        for sd in (-1, 1):
            els.append((CAP, ((sd * 0.172, 0.085, 0.06), (sd * 0.18, -0.03, 0.075)), 0.02, None, False, 2.5))
            els += [(B, (sd * 0.178, 0.06 - k * 0.04, 0.075), 0.02, None, False, 3.0) for k in range(3)]
    elif style == 'bun':
        for th, ph in scalp_grid(11, 48, 102):
            p, n = scalp.at(th, ph)
            if p:
                els.append((B, tuple(p), 0.04, None, False, 1.1))
        p0, n0 = scalp.at(math.radians(40), 0.0)
        p1, n1 = scalp.at(math.radians(2), 0.0)
        els.append((CAP, (tuple(p0 + n0 * 0.04), tuple(p1 + n1 * 0.04)), 0.008, None, True, 2.0))   # the parting
        for sd in (-1, 1):
            for k in range(3):
                a, na = scalp.at(math.radians(55 + k * 9), sd * math.radians(25))
                b, nb = scalp.at(math.radians(61 + k * 9), sd * math.radians(80))
                if a and b:
                    els.append((CAP, (tuple(a + na * 0.03), tuple(b + nb * 0.03)), 0.007, None, True, 2.0))
        bc, bn = scalp.at(math.radians(92), math.pi)
        bc = bc + bn * 0.06 + Vector((0, 0.03, 0))
        els.append((B, tuple(bc), 0.07, None, False, 2.0))
        for k in range(8):                                  # its twists
            a = math.tau * k / 8
            els.append((B, tuple(bc + Vector((math.cos(a) * 0.062, math.sin(a) * 0.062, -0.02))), 0.034, None, False, 2.6))
    else:
        for th, ph in scalp_grid(12, 46, 122, 0.03, rnd):
            p, n = scalp.at(th, ph)
            if not p:
                continue
            f = scalp.flow(th, ph)
            sd = f.cross(n).normalized()
            c = p + n * 0.014 + sd * 0.01 * math.sin(th * 14 + ph * 3)
            els.append((CAP, (tuple(c - f * 0.034 - sd * 0.008), tuple(c + f * 0.034 + sd * 0.008)), 0.021, None, False, 2.2))
    return mball('MBhair' + style, els, 0.005, marble, 0.03 if style == 'bun' else 0.035)

def laurel():
    leaves = []
    for sd in (-1, 1):                                      # two sprays meeting at the back
        for k in range(10):
            ph = sd * math.radians(14 + k * 15.5)
            th = hairline(ph, 40, 96) - math.radians(9)
            p, n = scalp.at(th, ph)
            p2, _ = scalp.at(th, ph + sd * 0.12)
            if not p:
                continue
            p = p + n * 0.03
            d = ((p2 + n * 0.03) - p).normalized() if p2 else Vector((sd, 0, 0))
            for up in (-1, 1):                              # in pairs, lying back along the head
                tilt = (d + n.cross(d).normalized() * up * 0.32).normalized()
                leaves.append(leaf(tuple(p + n * 0.004 * (up + 1)), tuple(tilt), tuple(n), 0.072, 0.022, marble))
    return leaves

def hat(kind):
    m = MATS['hat_black']
    sides_up = lambda amt: (lambda p, a: Vector((p.x, p.y + amt * math.sin(a) ** 2 * max(0.0, Vector((p.x, 0, p.z + 0.03)).length - 0.19) / 0.1, p.z)))
    if kind == 'top':
        obs = [lathe_shape([(0.19, 0.0), (0.275, -0.004), (0.298, 0.012), (0.293, 0.027), (0.27, 0.02), (0.19, 0.022)], (0, 0.175, -0.03), m, 22, 'brim', warp=sides_up(0.035)),
               lathe_shape([(0.193, 0.0), (0.186, 0.05), (0.19, 0.18), (0.2, 0.27), (0.205, 0.3), (0.12, 0.303), (0.0, 0.305)], (0, 0.18, -0.03), m, 22, 'crown'),
               lathe_shape([(0.197, 0.0), (0.197, 0.05), (0.19, 0.052)], (0, 0.19, -0.03), m, 22, 'band', subdiv=0)]
    else:
        obs = [lathe_shape([(0.18, 0.0), (0.245, -0.003), (0.262, 0.012), (0.255, 0.024), (0.235, 0.018), (0.18, 0.02)], (0, 0.18, -0.03), m, 22, 'brim', warp=sides_up(0.03)),
               lathe_shape([(0.188, 0.0), (0.192, 0.05), (0.18, 0.11), (0.14, 0.16), (0.08, 0.183), (0.0, 0.19)], (0, 0.185, -0.03), m, 22, 'crown'),
               lathe_shape([(0.193, 0.0), (0.193, 0.035), (0.188, 0.037)], (0, 0.19, -0.03), m, 22, 'band', subdiv=0)]
    for o in obs:                                           # oval, to fit a head longer than it is wide
        for v in o.data.vertices:
            v.co.y = (v.co.y - 0.03) * 1.08 + 0.03          # Blender y is three's -z; the hats are centred at z = -0.03
    return obs

# the bodies, in the bust's frame, each on the same turned socle
SOCLE = [(0.15, -0.025), (0.163, -0.02), (0.165, 0.012), (0.152, 0.024), (0.122, 0.04), (0.098, 0.068), (0.09, 0.098), (0.1, 0.12), (0.122, 0.135),
         (0.128, 0.152), (0.0, 0.153)]
CHEST = [(0.15, 0.1, 0.08, 0.0), (0.168, 0.2, 0.12, 0.0), (0.205, 0.27, 0.145, 0.0), (0.265, 0.305, 0.16, 0.0), (0.325, 0.315, 0.158, -0.005),
         (0.365, 0.3, 0.148, -0.01), (0.398, 0.24, 0.13, -0.015), (0.42, 0.15, 0.1, -0.02), (0.437, 0.095, 0.085, -0.025)]   # y, half-width, half-depth, z
def on_chest(x, y, out=0.0):
    """The point on the chest's front at x, y (lifted out by out)."""
    y = min(max(y, CHEST[0][0]), CHEST[-1][0])
    for (y0, rx0, rz0, z0), (y1, rx1, rz1, z1) in zip(CHEST, CHEST[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0)
            rx, rz, zc = rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t, z0 + (z1 - z0) * t
            break
    u = min(0.98, abs(x) / rx)
    return (x, y, zc + rz * (1 - u ** 2.6) ** (1 / 2.6) + out)
chest_normal = lambda p: (p.x * 0.6, 0.35, p.z + 0.03)
def bust_body(kind):
    obs = [lathe_shape(SOCLE, (0, 0, 0), marble, 28, 'socle', subdiv=0),
           loft([ellipse((0, y, z0), rx, rz, 20, sq=2.6) for y, rx, rz, z0 in CHEST], marble, 'chest')]
    if kind in ('coat', 'coat-bow'):                        # a frock coat over a buttoned waistcoat
        for sd in (-1, 1):
            obs.append(strap([on_chest(sd * x, y, 0.004) for x, y in ((0.07, 0.43), (0.098, 0.39), (0.11, 0.335), (0.098, 0.275), (0.062, 0.205))],
                             [0.022, 0.032, 0.042, 0.036, 0.016], 0.011, marble, chest_normal, name='lapel'))
            obs.append(strap([on_chest(sd * x, y, 0.003) for x, y in ((0.17, 0.39), (0.2, 0.36), (0.25, 0.32))], [0.02, 0.03, 0.02], 0.008, marble, chest_normal, n=8, name='seam'))
        obs += [blob(on_chest(0, y, 0.004), (0.011, 0.011, 0.007), marble, 'button', subdiv=0) for y in (0.3, 0.255, 0.21)]
        if kind == 'coat':                                  # a cravat with a pin
            obs += [blob((0, 0.414, 0.088), (0.046, 0.027, 0.03), marble, 'knot'), blob((0, 0.376, 0.112), (0.043, 0.042, 0.027), marble, 'puff', rot=(0.25, 0, 0)),
                    blob((0, 0.336, 0.126), (0.033, 0.034, 0.022), marble, 'puff', rot=(0.3, 0, 0)), blob((0, 0.382, 0.138), (0.008, 0.008, 0.008), marble, 'pin', subdiv=0)]
        else:                                               # a bow tie and a wing collar
            for sd in (-1, 1):
                obs += [blob((sd * 0.041, 0.413, 0.098), (0.034, 0.022, 0.016), marble, 'bow', rot=(0, 0, sd * 0.22)),
                        blob((sd * 0.034, 0.436, 0.088), (0.026, 0.016, 0.01), marble, 'wing', rot=(0.5, 0, sd * 0.6))]
            obs.append(blob((0, 0.413, 0.106), (0.015, 0.017, 0.014), marble, 'knot'))
    elif kind == 'gown':                                    # a shawl over the shoulders, pinned with a cameo brooch
        for sd in (-1, 1):
            obs.append(strap([(sd * 0.2, 0.395, -0.09), (sd * 0.255, 0.372, 0.03), on_chest(sd * 0.2, 0.33, 0.012), on_chest(sd * 0.1, 0.29, 0.012), on_chest(sd * 0.015, 0.265, 0.01)],
                             [0.05, 0.055, 0.05, 0.045, 0.03], 0.022, marble, chest_normal, name='shawl'))
        obs.append(tube([on_chest(x, y, 0.002) for x, y in ((-0.14, 0.405), (-0.08, 0.37), (0.0, 0.355), (0.08, 0.37), (0.14, 0.405))], [0.008] * 5, marble, n=8, name='neckline'))
        obs.append(blob(on_chest(0, 0.27, 0.028), (0.028, 0.034, 0.012), marble, 'brooch'))
        obs.append(tube([on_chest(0.03 * math.sin(a), 0.27 + 0.036 * math.cos(a), 0.036) for a in (math.tau * k / 12 for k in range(13))], [0.006] * 13, marble, n=6, name='brooch-rim', subdiv=0))
    else:                                                   # a toga, its folds falling from the left shoulder across the chest
        obs.append(strap([(-0.2, 0.402, -0.11), (-0.235, 0.39, -0.01), on_chest(-0.215, 0.36, 0.01), on_chest(-0.17, 0.31, 0.008)],
                         [0.06, 0.075, 0.06, 0.03], 0.02, marble, chest_normal, name='shoulder-cloth'))
        for k in range(5):                                  # fanning out from the shoulder, sagging a little more each
            xs, ys, xe, ye, sag = -0.2 + k * 0.012, 0.395 - k * 0.035, 0.215, 0.33 - k * 0.03, 0.03 + 0.005 * k
            pts = [(xs + (xe - xs) * t, ys + (ye - ys) * t - sag * math.sin(math.pi * t)) for t in (0, 0.25, 0.5, 0.75, 1)]
            obs.append(strap([on_chest(x, y, 0.005) for x, y in pts], [0.012, 0.022, 0.025, 0.022, 0.01], 0.012, marble, chest_normal, n=8, name='fold'))
        obs.append(blob(on_chest(0.2, 0.37, 0.012), (0.026, 0.026, 0.012), marble, 'fibula'))
    return obs

part('bust-head', [bust_head])
for style in ('short', 'fringe', 'curls', 'bun', 'wavy'):
    part('bust-hair-' + style, [hair(style)])
part('bust-laurel', laurel())
for kind in ('top', 'bowler'):
    simplify(part('bust-hat-' + kind, hat(kind)), 0.6)
for kind in ('coat', 'coat-bow', 'gown', 'toga'):
    simplify(part('bust-body-' + kind, bust_body(kind)), 0.6)

# ------------------------------------------------------------------ the raven (js/props.js raven), perched, facing +z, feet at y = 0
feather, horn = MATS['raven'], MATS['beak']
RAVEN_HEAD = (0, 0.38, 0.12)                            # the head's pivot
def wing_rest(side):                                    # the site rolls each wing's pivot this far at rest
    return 0.2 if side < 0 else -0.2
def to_wing(p, side):                                   # the raven's frame -> a wing pivot's
    return tuple(Matrix.Rotation(-wing_rest(side), 3, 'Z') @ (Vector(p) - Vector((side * 0.1, 0.26, 0.0))))
rb = [
    (E, (0, 0.205, 0.06), (0.086, 0.106, 0.1), (-0.5, 0, 0)),      # breast
    (E, (0, 0.14, -0.02), (0.076, 0.072, 0.11)),                    # belly
    (E, (0, 0.19, -0.11), (0.074, 0.064, 0.145), (0.3, 0, 0)),      # back, sloping to the tail
    (E, (0, 0.3, 0.1), (0.05, 0.07, 0.055), (-0.5, 0, 0)),          # neck
    (CAP, ((0, 0.16, -0.19), (0, 0.12, -0.26)), 0.032),            # tail root
    (B, (0.045, 0.1, 0.012), 0.033), (B, (-0.045, 0.1, 0.012), 0.033),   # thighs
]
rb += [(CAP, ((x, y0, 0.152), (x * 1.3, y0 - 0.04, 0.163)), 0.008, None, False, 3.0)   # a shaggy throat
       for x, y0 in ((0.0, 0.362), (0.017, 0.356), (-0.017, 0.356), (0.009, 0.338), (-0.009, 0.338))]
raven = [mball('MBraven', rb, 0.004, feather, 0.06)]
for k in range(7):                                      # a wedge-shaped tail
    u = (k - 3) / 3
    raven.append(strap([(u * 0.012, 0.135, -0.2), (u * 0.04, 0.09, -0.31), (u * 0.075, 0.035 + abs(u) * 0.012, -0.43 + abs(u) * 0.06)], [0.016, 0.022, 0.006],
                       0.004 + 0.001 * (3 - abs(k - 3)), feather, lambda p: (0, 1, 0.35), n=8, name='tail'))
for sd in (-1, 1):                                      # legs, and feet gripping the perch
    raven.append(tube([(sd * 0.042, 0.095, 0.02), (sd * 0.043, 0.05, 0.03), (sd * 0.044, 0.017, 0.035)], [0.012, 0.01, 0.009], horn, n=8, name='leg'))
    for dx, dz in ((-0.02, 0.045), (0.0, 0.055), (0.02, 0.045), (0.0, -0.047)):
        raven.append(tube([(sd * 0.044, 0.014, 0.035), (sd * 0.044 + dx * 0.6, 0.012, 0.035 + dz * 0.6), (sd * 0.044 + dx, 0.0, 0.035 + dz)],
                          [0.007, 0.006, 0.0015], horn, n=6, name='toe', subdiv=0))
part('raven-body', raven)
side_on = lambda p: (1, 0, 0)
head = [mball('MBravenhead', [(E, (0, 0.0, -0.005), (0.058, 0.062, 0.075)), (E, (0, 0.022, 0.035), (0.045, 0.042, 0.05)),
                              (E, (0, -0.026, 0.028), (0.05, 0.034, 0.05)), (E, (0, 0.002, 0.083), (0.026, 0.024, 0.032))], 0.003, feather, 0.07),
        strap([(0, 0.004, 0.07), (0, 0.0, 0.13), (0, -0.012, 0.18), (0, -0.032, 0.215)], [0.026, 0.02, 0.012, 0.002], [0.018, 0.013, 0.008, 0.0015], horn, side_on, name='beak'),
        strap([(0, -0.024, 0.072), (0, -0.03, 0.13), (0, -0.034, 0.185)], [0.012, 0.009, 0.002], [0.015, 0.01, 0.002], horn, side_on, n=8, name='jaw')]
head += [blob((sd * 0.05, 0.018, 0.036), (0.016, 0.016, 0.013), MATS['raven_eye'], 'eye', subdiv=0) for sd in (-1, 1)]   # they glow (js/props.js)
part('raven-head', head)
for sd in (-1, 1):                                      # folded wings: coverts over layered flight feathers
    wing = [strap([to_wing(p, sd) for p in ((sd * 0.072, 0.272, 0.04), (sd * 0.083, 0.24, -0.05), (sd * 0.074, 0.205, -0.14), (sd * 0.05, 0.178, -0.21))],
                  [0.05, 0.068, 0.055, 0.028], 0.011, feather, lambda p, sd=sd: (sd, 0.7, 0), name='covert')]
    for k in range(6):
        y0 = 0.235 - k * 0.011
        pts = ((sd * 0.08, y0, -0.02 - k * 0.014), (sd * 0.08, y0 - 0.045, -0.13 - k * 0.012), (sd * (0.065 - k * 0.003), y0 - 0.085, -0.25 - k * 0.014),
               (sd * (0.042 - k * 0.004), y0 - 0.105 + k * 0.004, -0.34 - k * 0.014))
        wing.append(strap([to_wing(p, sd) for p in pts], [0.026, 0.028, 0.02, 0.004], 0.005, feather, lambda p, sd=sd: (sd, 0.55, 0), n=8, name='feather'))
    part('raven-wing-' + ('l' if sd < 0 else 'r'), wing)

# ------------------------------------------------------------------ ambient occlusion into vertex colours, posed as on the site
scene = bpy.context.scene
scene.world = bpy.data.worlds.new('world')
def bake_ao(ob, distance):
    """Bake ob's ambient occlusion (from whatever stands near it) into a per-vertex colour, reaching distance."""
    scene.world.light_settings.distance = distance
    attr = ob.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')   # per vertex, so the export needn't split vertices
    ob.data.color_attributes.active_color = attr
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for c in attr.data:                                # keep the darkest creases at a third, so the lights still read
        a = c.color[0]
        c.color = (0.32 + 0.68 * a,) * 3 + (1.0,)
    kit.log(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triangles, AO baked')
def stand(name, xyz, roll=0.0, rx=0.0):
    PARTS[name].location = V(*xyz)
    PARTS[name].rotation_euler = (rx, -roll, 0)        # three's x, then its z (Blender's -y)
def disc(x, y, z, r):
    return loft([ellipse((x, y - 0.04, z), r, r, 16), ellipse((x, y, z), r, r, 16)], MATS['boots'], 'floor', subdiv=0)
for name in PARTS:                                     # everyone waits well away until it's their turn
    stand(name, (-40, 0, 0))
floors = [disc(0, 0, 0, 3), disc(3, 0, 0, 3)]
# the caretaker and his dog, together; creases and undersides, not whole limbs
for name, (xyz, rx) in {'caretaker-legs': ((0, 0, 0), 0), 'caretaker-torso': ((0, 0.7, 0), 0.35), 'dog-body': ((3, 0, 0), 0), 'dog-head': ((3, 0.6, 0.32), 0)}.items():
    stand(name, xyz, rx=rx)
for name in ('caretaker-legs', 'caretaker-torso', 'dog-body', 'dog-head'):
    bake_ao(PARTS[name], 0.12)
# each bust part with the parts that shade it (the head is baked without hair, as every bust wears different hair)
floors.append(disc(10, -0.02, 0, 0.32))               # the pedestal's top
SHADED_BY = {'bust-head': ['bust-body-toga'], 'bust-body-coat': ['bust-head', 'bust-hair-fringe', 'bust-hat-top'],
             'bust-body-coat-bow': ['bust-head', 'bust-hair-fringe', 'bust-hat-bowler'], 'bust-body-gown': ['bust-head', 'bust-hair-bun'],
             'bust-body-toga': ['bust-head', 'bust-hair-curls'], 'bust-hair-short': ['bust-head', 'bust-body-toga'],
             'bust-hair-fringe': ['bust-head', 'bust-body-coat', 'bust-hat-top'], 'bust-hair-curls': ['bust-head', 'bust-body-toga'],
             'bust-hair-bun': ['bust-head', 'bust-body-gown'], 'bust-hair-wavy': ['bust-head', 'bust-body-toga', 'bust-laurel'],
             'bust-laurel': ['bust-head', 'bust-hair-wavy'], 'bust-hat-top': ['bust-head', 'bust-hair-fringe'], 'bust-hat-bowler': ['bust-head', 'bust-hair-fringe']}
on_bust = lambda name: (10, 0 if name.startswith('bust-body') else 0.6, 0)
for name, others in SHADED_BY.items():
    stand(name, on_bust(name))
    company = []
    for o in others:
        c = PARTS[o].copy()
        scene.collection.objects.link(c)
        c.location = V(*on_bust(o))
        company.append(c)
    bake_ao(PARTS[name], 0.06)
    for c in company:
        bpy.data.objects.remove(c, do_unlink=True)
    stand(name, (-40, 0, 0))
# the raven on its perch, wings folded
floors.append(disc(14, 0, 0, 0.3))
stand('raven-body', (14, 0, 0))
stand('raven-head', (14 + RAVEN_HEAD[0], RAVEN_HEAD[1], RAVEN_HEAD[2]))
for sd in (-1, 1):
    stand('raven-wing-' + ('l' if sd < 0 else 'r'), (14 + sd * 0.1, 0.26, 0), wing_rest(sd))
for name in ('raven-body', 'raven-head', 'raven-wing-l', 'raven-wing-r'):
    bake_ao(PARTS[name], 0.04)
for ob in PARTS.values():
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
for f in floors:
    bpy.data.objects.remove(f, do_unlink=True)

# ------------------------------------------------------------------ the singing busts' faces
# js/outside.js paints each bust's eyes and mouth (js/paint.js bustFaces) and swaps the frames as it sings. They are
# projected onto a thin shell over the front of the head, laid on from straight ahead so the painted eyes land on the
# carved ones: on the canvas the eyes are at u = 0.5 -/+ 0.156, 50 px down, and the mouth 92 px down. glTF stores v
# top-down while the site's canvas textures are sampled bottom-up, so v is written flipped.
face = PARTS['bust-head'].copy()
face.data = PARTS['bust-head'].data.copy()
scene.collection.objects.link(face)
bm = bmesh.new()
bm.from_mesh(face.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (abs(f.calc_center_median().x) < 0.125 and -0.205 < f.calc_center_median().z < 0.105
                                                         and -f.calc_center_median().y > 0.1 and -f.normal.y > 0.25)], context='FACES')
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.0015
uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    for loop in f.loops:
        loop[uv].uv = (0.5 + loop.vert.co.x / 0.423, 1 - (0.609 + (loop.vert.co.z - 0.035) / 0.503))
bm.to_mesh(face.data)
bm.free()
for a in list(face.data.color_attributes):
    face.data.color_attributes.remove(a)
face.data.materials.clear()
face.data.materials.append(MATS['bust_face'])
face.name = face.data.name = 'Fig_bust-face'
PARTS['bust-face'] = face
kit.log(f'bust-face: {len(face.data.polygons)} triangles')
for ob in PARTS.values():                              # only the face needs texture coordinates
    if ob is not face:
        while ob.data.uv_layers:
            ob.data.uv_layers.remove(ob.data.uv_layers[0])

bpy.ops.object.select_all(action='DESELECT')
for ob in PARTS.values():
    ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(A['out'], 'figures.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE', export_vertex_color='ACTIVE',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10, export_draco_position_quantization=12,
    export_draco_normal_quantization=8, export_draco_color_quantization=8, export_draco_texcoord_quantization=10, export_cameras=False, export_lights=False,
)
kit.log('DONE', os.path.getsize(os.path.join(A['out'], 'figures.glb')) // 1024, 'KB')
