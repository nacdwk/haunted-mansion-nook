"""Model the graveyard's caretaker and his trembling dog (js/outside.js) as smooth sculpted figures and export them
for the site to light live. They move, so instead of a lightmap each one carries its ambient occlusion in its
vertex colours (baked with Cycles), which keeps folds, armpits and the shadow under the hat brim dark whatever the
lights do.

    blender -b --factory-startup -P blender/figures.py -- --out blender/build

Writes figures.glb with one object per moving part, each in the frame js/outside.js animates it in:
Fig_caretaker-legs (the caretaker's group), Fig_caretaker-torso (its pivot at the hips, before the stoop),
Fig_dog-body (the dog's group) and Fig_dog-head (its pivot at the top of the neck).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh, bpy
from mathutils import Vector, Matrix
import kit
from kit import V, hexcol

A = kit.args({'out': 'assets', 'samples': 64})
kit.reset_scene(A['samples'])
MATS = {}
for name, col, rough in [('coat', '#4a3a2e', 0.9), ('trousers', '#2a2420', 0.9), ('boots', '#141016', 0.5), ('skin', '#d8b896', 0.7),
                         ('nose', '#c8907a', 0.6), ('hat', '#2a2018', 0.9), ('scarf', '#7a1a22', 0.9), ('gloves', '#3a3030', 0.8),
                         ('brows', '#8a8580', 0.9), ('eyes', '#120d12', 0.3), ('fur', '#4e463e', 0.95), ('dog_nose', '#15101a', 0.4)]:
    MATS[name] = kit.mat(name, col, rough)

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

def ellipse(c, rx, rz, n=12, y_axis=False, ry=None, phase=0.0, wobble=None):
    """A horizontal ring round the point c (or, with y_axis, an upright ring facing along z, rx wide and ry high)."""
    pts = []
    for j in range(n):
        t = math.tau * j / n + phase
        k = 1 + (wobble(t) if wobble else 0)
        if y_axis:
            pts.append(Vector((c[0] + math.sin(t) * rx * k, c[1] + math.cos(t) * ry * k, c[2])))
        else:
            pts.append(Vector((c[0] + math.sin(t) * rx * k, c[1], c[2] + math.cos(t) * rz * k)))
    return pts

def tube(path, radii, m, n=10, name='limb', subdiv=1, flat=1.0):
    """A limb along a path (three coords) with a radius at each point; flat squashes it across its normal."""
    path = [Vector(p) for p in path]
    rings = []
    for c, r, (t, nn, bb) in zip(path, radii, frames(path)):
        rings.append([c + nn * math.cos(a) * r * flat + bb * math.sin(a) * r for a in (math.tau * j / n for j in range(n))])
    return loft(rings, m, name, subdiv)

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

PARTS = {}
def part(name, obs):
    """Join objects into one export object."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
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

# ------------------------------------------------------------------ ambient occlusion into vertex colours, posed as on the site
scene = bpy.context.scene
scene.world = bpy.data.worlds.new('world')
scene.world.light_settings.distance = 0.12               # creases and undersides, not whole limbs
ground = loft([ellipse((0, -0.02, 0), 3, 3, 8), ellipse((0, 0, 0), 3, 3, 8)], MATS['boots'], 'ground', subdiv=0)
POSE = {'caretaker-legs': ((0, 0, 0), 0), 'caretaker-torso': ((0, 0.7, 0), 0.35), 'dog-body': ((3, 0, 0), 0), 'dog-head': ((3, 0.6, 0.32), 0)}
dog_ground = ground.copy()
dog_ground.location = V(3, 0, 0)
scene.collection.objects.link(dog_ground)
for name, ob in PARTS.items():
    (x, y, z), rx = POSE[name]
    ob.location = V(x, y, z)
    ob.rotation_euler = (rx, 0, 0)
for name, ob in PARTS.items():
    attr = ob.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')   # per vertex, so the export needn't split vertices
    ob.data.color_attributes.active_color = attr
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for c in attr.data:                            # keep the darkest creases at a third, so the lights still read
        a = c.color[0]
        c.color = (0.32 + 0.68 * a,) * 3 + (1.0,)
    kit.log(f'{name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triangles, AO baked')
for name, ob in PARTS.items():
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
bpy.data.objects.remove(ground, do_unlink=True)
bpy.data.objects.remove(dog_ground, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
for ob in PARTS.values():
    ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(A['out'], 'figures.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_texcoords=False, export_normals=True, export_materials='EXPORT', export_image_format='NONE', export_vertex_color='ACTIVE',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10, export_draco_position_quantization=14,
    export_draco_normal_quantization=8, export_draco_color_quantization=8, export_cameras=False, export_lights=False,
)
kit.log('DONE', os.path.getsize(os.path.join(A['out'], 'figures.glb')) // 1024, 'KB')
