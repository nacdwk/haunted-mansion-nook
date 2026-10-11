"""Dead trees for the bake scripts, grown from the seeds the site passes to js/props.js deadTree.

skeleton() replays deadTree's random numbers, so it returns the same branches, in the same order, as the
site's tree (and where it hangs moss). gnarled() grows a detailed tree on that skeleton: a ridged, twisting
trunk on buttress and surface roots, knots and broken stubs, branches that leave along their parent before
bending away, a finer crown of hooked twigs and, if asked, Spanish moss.
All coordinates here are three coords; kit.V converts them.
"""
import math
import random
import bmesh
from mathutils import Vector, Quaternion
import kit


def catmull_rom(pts):
    """THREE.CatmullRomCurve3(pts).getPoint(t) for the default centripetal curve."""
    n = len(pts)
    def at(t):
        p = (n - 1) * t
        i = math.floor(p)
        w = p - i
        if w == 0 and i == n - 1:
            i, w = n - 2, 1.0
        p0 = pts[i - 1] if i > 0 else tuple(2 * a - b for a, b in zip(pts[0], pts[1]))
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else tuple(2 * a - b for a, b in zip(pts[-1], pts[-2]))
        d2 = lambda a, b: sum((x - y) ** 2 for x, y in zip(a, b))
        dt0, dt1, dt2 = d2(p0, p1) ** 0.25, d2(p1, p2) ** 0.25, d2(p2, p3) ** 0.25
        if dt1 < 1e-4:
            dt1 = 1.0
        if dt0 < 1e-4:
            dt0 = dt1
        if dt2 < 1e-4:
            dt2 = dt1
        out = []
        for x0, x1, x2, x3 in zip(p0, p1, p2, p3):
            t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
            t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
            c2, c3 = -3 * x1 + 3 * x2 - 2 * t1 - t2, 2 * x1 - 2 * x2 + t1 + t2
            out.append(x1 + t1 * w + c2 * w * w + c3 * w * w * w)
        return tuple(out)
    return at


def skeleton(x, y, z, h, r, seed, spread=1.0, moss=False, crown=False):
    """deadTree's branches in the order the site makes them: dicts of curve (t -> centre), rad, length, depth
    (3 for the trunk down to 0 for the outermost twigs), parent (an index) and at (where on the parent it starts)."""
    s = seed * 9301 + 49297
    def rnd():
        nonlocal s
        s = (s * 9301 + 49297) % 233280
        return s / 233280
    def unit(v):
        L = math.sqrt(sum(a * a for a in v)) or 1.0
        return [a / L for a in v]
    out = []
    def branch(p, d, length, rad, depth, parent, at_t):
        pts, cur, d = [p], p, list(d)
        for _ in range(4):
            wob = 0.12 if crown and depth == 3 else 0.5
            d[0] += (rnd() - 0.5) * wob * spread
            d[2] += (rnd() - 0.5) * wob * spread
            d[1] += 0.05
            d = unit(d)
            cur = tuple(c + a * length / 4 for c, a in zip(cur, d))
            pts.append(cur)
        curve = catmull_rom(pts)
        me = len(out)
        out.append(dict(curve=lambda t, c=curve: tuple(a + b for a, b in zip(c(t), (x, y, z))),
                        rad=rad, length=length, depth=depth, parent=parent, at=at_t))
        if moss and depth >= 1:
            out[me]['moss'] = rnd() < 0.6                           # the site hangs a clump of moss from its end
        if depth <= 0:
            return
        for _ in range(3 if depth > 1 else 2):
            nd = list(d)
            nd[0] += (rnd() - 0.5) * 1.6 * spread
            nd[2] += (rnd() - 0.5) * 1.6 * spread
            nd[1] = max(0.15, nd[1] - rnd() * 0.3)
            nd = unit(nd)
            t = 0.88 + rnd() * 0.12 if crown and depth == 3 else 0.6 + rnd() * 0.4
            branch(curve(t), nd, length * (0.55 + rnd() * 0.2), rad * 0.55, depth - 1, me, t)
    branch((0.0, 0.0, 0.0), (0.0, 1.0, 0.0), h * 0.55, r, 3, None, 0.0)
    return out


def _frames(cs):
    """Rotation-minimising (tangent, normal, binormal) frames along a polyline, so rings don't twist."""
    n = len(cs)
    ts = [(cs[min(n - 1, i + 1)] - cs[max(0, i - 1)]).normalized() for i in range(n)]
    nrm = ts[0].orthogonal().normalized()
    out = []
    for t in ts:
        nrm = (nrm - t * nrm.dot(t)).normalized()
        out.append((t, nrm, t.cross(nrm)))
    return out


def _tube(bm, cs, radii, sides, shape=None, tip=False, cap=False):
    """Rings of `sides` vertices round the centres cs, wound so their faces point outwards. shape(i, theta,
    direction) scales a vertex's radius; tip closes the far end to a point, cap closes it flat."""
    rings = []
    last = len(cs) - 1
    for i, (c, r, (t, n, b)) in enumerate(zip(cs, radii, _frames(cs))):
        if tip and i == last:
            rings.append([bm.verts.new(kit.V(*c))])
            continue
        ring = []
        for j in range(sides):
            th = j / sides * math.tau
            d = n * math.cos(th) + b * math.sin(th)
            ring.append(bm.verts.new(kit.V(*(c + d * (r * (shape(i, th, d) if shape else 1.0))))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((r0[j], r0[k], r1[0]) if len(r1) == 1 else (r0[j], r0[k], r1[k], r1[j]))
    if cap:
        bm.faces.new(rings[-1])
    return rings


def _at(ss, cs, t):
    """The point at t along a polyline sampled at parameters ss."""
    for k in range(1, len(ss)):
        if t <= ss[k] or k == len(ss) - 1:
            f = min(1.0, max(0.0, (t - ss[k - 1]) / ((ss[k] - ss[k - 1]) or 1.0)))
            return cs[k - 1].lerp(cs[k], f)


SIDES = {3: 24, 2: 12, 1: 10, 0: 8}
RINGS = {3: 26, 2: 14, 1: 10, 0: 8}
GNARL = {3: 0.2, 2: 0.26, 1: 0.18, 0: 0.12}           # how far a branch's centre line wanders
RIDGES = {3: (6, 0.09), 2: (3, 0.06), 1: (3, 0.04)}     # bark ridges: count and depth, twisting up the branch

def gnarled(branches, m, seed, keep_out=None, name='tree', moss=None, detail=1.0):
    """Grow the detailed tree on a skeleton and return its parts. keep_out(p) is true where nothing may grow
    (the ride's path); new twigs that would reach into it are left off. The twigs go in the lowres part of the
    lightmap, in whatever export group is current. detail < 1 uses fewer sides, rings and twigs, for small trees;
    roots, knots and stubs are sized to the trunk."""
    rng = random.Random(seed * 1013 + 7)
    few = lambda n, least: max(least, round(n * detail))
    k_tr = branches[0]['rad'] / 0.75                 # roots, knots and stubs scale with the trunk
    bm, fine = bmesh.new(), bmesh.new()
    grown = []                                     # per branch: ring parameters, centres and radius function
    for b in branches:
        depth, L, rad = b['depth'], b['length'], b['rad']
        trunk = b['parent'] is None
        n = few(RINGS[depth], 4)
        ss = [(k / (n - 1)) ** (1.4 if trunk else 1.0) for k in range(n)]   # the trunk's rings bunch up at its foot
        orig = [Vector(b['curve'](s)) for s in ss]
        shift, lead = Vector((0, 0, 0)), None
        if not trunk:                              # follow the parent wherever its own wandering moved it
            ps, pc, _ = grown[b['parent']]
            at = b['at']
            shift = _at(ps, pc, at) - Vector(branches[b['parent']]['curve'](at))
            lead = (_at(ps, pc, min(1.0, at + 0.03)) - _at(ps, pc, max(0.0, at - 0.03))).normalized()
        ph = [rng.uniform(0, math.tau) for _ in range(6)]
        cs = []
        for s, c, (t, nn, bb) in zip(ss, orig, _frames(orig)):
            env = math.sin(math.pi * s) if trunk else s           # the trunk keeps its foot and its top on the axis
            g1 = math.sin(math.tau * 0.9 * s + ph[0]) + 0.5 * math.sin(math.tau * 1.9 * s + ph[1]) + 0.25 * math.sin(math.tau * 3.7 * s + ph[2])
            g2 = math.sin(math.tau * 0.9 * s + ph[3]) + 0.5 * math.sin(math.tau * 1.9 * s + ph[4]) + 0.25 * math.sin(math.tau * 3.7 * s + ph[5])
            p = c + shift + (nn * g1 + bb * g2) * GNARL[depth] * env
            if lead is not None:                   # leave along the parent, then bend away: a Y-shaped fork, not an elbow
                x = min(1.0, s / (0.3 if depth == 2 else 0.2))
                p = (orig[0] + shift + lead * (s * L)).lerp(p, x * x * (3 - 2 * x))
            cs.append(p)
        if trunk:
            radius = lambda s, L=L, r0=rad: r0 * (1 - 0.38 * s) * (1 + 0.6 * math.exp(-s * L / 0.9))   # flared foot
            phi0 = rng.uniform(0, math.tau)           # where the buttresses and roots point
        else:                                      # a collar where it leaves its parent, then a taper
            k, collar = (0.45 if depth >= 1 else 0.75), (0.0 if depth == 2 else 0.4)   # limbs grow straight out of the trunk
            radius = lambda s, L=L, r0=rad, k=k, collar=collar: r0 * (1 - k * s) * (1 + collar * math.exp(-s * L / (1.2 * r0)))
        grown.append((ss, cs, radius))
        shape, sides = None, few(SIDES[depth], 8)   # 8 or more sides stay smooth (the bake splits edges sharper than 50 degrees)
        if depth in RIDGES and (detail >= 1 or sides >= 9):
            count, amp = RIDGES[depth]
            if detail < 1:                         # keep at least four vertices to a ridge
                count = max(3, min(count, sides // 4))
            twist = rng.uniform(0.025, 0.04) * rng.choice((-1, 1))          # turns per unit of length
            def shape(i, th, d, ss=ss, L=L, count=count, amp=amp, twist=twist, trunk=trunk):
                v = 1 + amp * min(1.0, (1 - ss[i]) * 8) * math.sin(count * (th - math.tau * twist * ss[i] * L))   # smooth where it forks
                if trunk:                          # buttresses that run out into the roots
                    v *= 1 + 0.3 * max(0.0, math.cos(5 * (math.atan2(d.z, d.x) - phi0))) ** 2 * math.exp(-ss[i] * L / 0.7)
                return v
        _tube(bm, cs, [radius(s) for s in ss], sides, shape, tip=True)

    ss0, cs0, r0 = grown[0]
    up = Vector((0, 1, 0))
    for k in range(5):                             # surface roots, half sunk into the lawn
        a = phi0 + k * math.tau / 5 + rng.uniform(-0.25, 0.25)
        out, side = Vector((math.cos(a), 0, math.sin(a))), Vector((math.sin(a), 0, -math.cos(a)))
        reach, wob = rng.uniform(2.0, 2.5) * k_tr ** 0.5, rng.uniform(0.12, 0.22) * rng.choice((-1, 1)) * k_tr
        nr = few(9, 5)
        pts = [cs0[0] + out * (0.2 * k_tr + reach * s) + side * (math.sin(s * 5.0 + k) * wob * s) + up * ((1.4 * (1 - s) ** 2 - 0.3 * s) * k_tr ** 0.7)
               for s in (j / (nr - 1) for j in range(nr))]
        _tube(bm, pts, [0.52 * k_tr * (1 - 0.78 * j / (nr - 1)) for j in range(nr)], few(10, 8), tip=True)
    for k in range(few(4, 2)):                     # knots and burls
        s, a = rng.uniform(0.18, 0.75), rng.uniform(0, math.tau)
        out, side = Vector((math.cos(a), 0, math.sin(a))), Vector((math.sin(a), 0, -math.cos(a)))
        c = _at(ss0, cs0, s) + out * r0(s) * 0.82
        size = rng.uniform(0.8, 1.2) * k_tr
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.0)
        for v in res['verts']:
            lx, ly, lz = v.co
            v.co = kit.V(*(c + (out * lx * 0.26 + side * ly * 0.3 + up * lz * 0.42) * size))
    for k in range(2):                             # broken-off branches with jagged ends
        s, a = rng.uniform(0.3, 0.68), rng.uniform(0, math.tau)
        out = Vector((math.cos(a), 0.5, math.sin(a))).normalized()
        c, length = _at(ss0, cs0, s), r0(s) + rng.uniform(0.55, 0.85) * k_tr
        rings = _tube(bm, [c + out * (length * j / 4) for j in range(5)], [r * k_tr for r in (0.34, 0.31, 0.29, 0.27, 0.26)], few(10, 8), cap=True)
        for v in rings[-1]:
            v.co += kit.V(*(out * rng.uniform(-0.2, 0.06) * k_tr))

    for i, b in enumerate(branches):               # a finer crown: hooked twigs off the outer branches
        if b['depth'] > 1:
            continue
        ss, cs, radius = grown[i]
        for _ in range(few(3, 1) if b['depth'] == 0 else few(2, 1)):
            t = rng.uniform(0.3, 0.92) if b['depth'] == 0 else rng.uniform(0.2, 0.55)
            base = _at(ss, cs, t)
            tan = (_at(ss, cs, min(1.0, t + 0.03)) - _at(ss, cs, max(0.0, t - 0.03))).normalized()
            axis = tan.orthogonal().normalized()
            axis.rotate(Quaternion(tan, rng.uniform(0, math.tau)))
            d = tan.copy()
            d.rotate(Quaternion(axis, math.radians(rng.uniform(28, 52))))
            d = (d + up * 0.25).normalized()
            curl = Quaternion(axis, math.radians(rng.uniform(8, 16)) * rng.choice((-1, 1)))
            length = b['length'] * rng.uniform(0.3, 0.52)
            pts = [base]
            for _ in range(5):
                d.rotate(curl)
                pts.append(pts[-1] + d * (length / 5))
            if keep_out and any(keep_out(p) for p in pts):
                continue
            r = min(0.07, radius(t) * 0.6)
            _tube(fine, pts, [r * (1 - 0.8 * j / 5) for j in range(6)], 8, tip=True)
    strands = bmesh.new()
    for i, b in enumerate(branches):               # Spanish moss where the site hangs its clumps
        if not (moss and b.get('moss')):
            continue
        ss, cs, radius = grown[i]
        L = b['length']
        for _ in range(5):
            t = rng.uniform(0.72, 1.0)
            top = _at(ss, cs, t) - up * (radius(t) * 0.6)
            length = L * 0.45 * rng.uniform(0.55, 1.15)
            sway, ph = rng.uniform(0.04, 0.12), rng.uniform(0, math.tau)
            pts = [top + Vector((math.sin(ph + j) * sway * j / 4, -length * j / 4, math.cos(ph + j * 0.7) * sway * j / 4)) for j in range(5)]
            r = min(0.07, 0.03 + L * 0.006)
            _tube(strands, pts, [r * (1 - 0.75 * j / 4) for j in range(5)], 8, tip=True)
    obs = [kit.finish(bm, m, name)]
    lowres = kit._tag['lowres']
    kit._tag['lowres'] = 1
    obs.append(kit.finish(fine, m, name + '-twigs'))
    if moss and strands.faces:
        obs.append(kit.finish(strands, moss, name + '-moss'))
    else:
        strands.free()
    kit._tag['lowres'] = lowres
    return obs


# the spiral tree the ride descends around (js/outside.js), and the Doom Buggies' path round it (js/ride.js)
HELIX = (22.0, -1.8)
APPROACH = [(13.8, 14.55, 2.3), (16.8, 14.0, 2.0), (19.6, 12.6, 0.6)]     # the track from the attic to the top of the spiral

def on_ride(p):
    """True on the Doom Buggies' path round the tree, with room for the buggies themselves."""
    if 2.3 < math.hypot(p[0] - HELIX[0], p[2] - HELIX[1]) < 4.5 and 0.3 < p[1] < 15.2:
        return True
    for a, b in zip(APPROACH, APPROACH[1:]):
        vx, vz = b[0] - a[0], b[2] - a[2]
        t = max(0.0, min(1.0, ((p[0] - a[0]) * vx + (p[2] - a[2]) * vz) / (vx * vx + vz * vz)))
        y = a[1] + (b[1] - a[1]) * t
        if math.hypot(p[0] - a[0] - vx * t, p[2] - a[2] - vz * t) < 1.2 and y - 0.4 < p[1] < y + 2.4:
            return True
    return False

def spiral(m):
    return gnarled(skeleton(HELIX[0], 0.0, HELIX[1], h=25, r=0.75, seed=11, spread=0.8, crown=True), m, seed=11, keep_out=on_ride)

def behind_house(m):
    """The small tree behind the house (js/outside.js backYard)."""
    return gnarled(skeleton(-2.6, 0.0, -6.7, h=7, r=0.3, seed=5), m, seed=5, detail=0.5)
