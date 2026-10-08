"""Painted Fox rig for Rive: textures, skinned meshes and the bone tree.

Reads the approved painted Fox and its registered underpaint plates, cuts them
into depth layers, and describes each layer as a Rive Image with a skinned
Mesh. Joint pivots and part ownership come from the anatomy registration
(resources/styles/builtin/drafts/fox-states-v1/anatomy.json), so the Rive rig
bends at the same places as the development skeleton.

Coordinates: the artboard is SIZE x SIZE; normalized anatomy coordinates map
to artboard pixels by multiplying with SIZE. Every texture is written at the
artboard scale, so one texture pixel is one artboard unit.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
STYLE = ROOT / 'resources/styles/builtin'
DRAFTS = STYLE / 'drafts/fox-states-v1'
ANATOMY = json.loads((DRAFTS / 'anatomy.json').read_text())
SIZE = 640
SOURCE = 1254

PROPS = ('laptop', 'book', 'magnifier')
HIDDEN_AT_REST = ('lidsHalf', 'lidsClosed', *PROPS)
HEAD_GROUP = {'head', 'jaw', 'mouth', 'nose', 'eyeL', 'eyeR', 'browL', 'browR'}
EARS = {'earL', 'earR'}
# Parts painted on the body plate follow these bones; the forelimb areas there
# are underpaint behind the separate arms, so they ride the chest.
BODY_BONE = {
    'pelvis': 'pelvis', 'chest': 'chest', 'thighL': 'thighL', 'thighR': 'thighR',
    'footL': 'footL', 'footR': 'footR', 'scarf': 'scarf', 'scarfKnot': 'scarfKnot',
    'scarfTail': 'scarfTail', 'upperArmL': 'chest', 'forearmL': 'chest', 'pawL': 'chest',
    'upperArmR': 'chest', 'forearmR': 'chest', 'pawR': 'chest',
    **{p: 'neck' for p in HEAD_GROUP}, 'earL': 'neck', 'earR': 'neck',
}


def load(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32)


def smooth(x):
    t = np.clip(x, 0, 1)
    return t * t * (3 - 2 * t)


def smoother(x):
    t = np.clip(x, 0, 1)
    return t * t * t * (10 + t * (-15 + 6 * t))


def in_polygon(x: np.ndarray, y: np.ndarray, polygon) -> np.ndarray:
    inside = np.zeros(x.shape, bool)
    n = len(polygon)
    for i in range(n):
        ax, ay = polygon[i]
        bx, by = polygon[i - 1]
        crosses = (ay > y) != (by > y)
        with np.errstate(divide='ignore', invalid='ignore'):
            at = (bx - ax) * (y - ay) / (by - ay) + ax
        inside ^= crosses & (x < at)
    return inside


def owner_map(size: int) -> np.ndarray:
    """Index of the anatomy part owning each pixel (last match wins)."""
    ys, xs = np.mgrid[0:size, 0:size]
    x, y = (xs + .5) / size, (ys + .5) / size
    owner = np.zeros((size, size), np.int16)
    for index, part in enumerate(ANATOMY['parts']):
        if part.get('ellipse'):
            cx, cy, rx, ry = part['ellipse']
            hit = np.hypot((x - cx) / rx, (y - cy) / ry) < 1
        else:
            hit = in_polygon(x, y, part['polygon'])
        owner[hit] = index
    return owner


PART_IDS = [p['id'] for p in ANATOMY['parts']]


def part_mask(owner: np.ndarray, ids: set[str]) -> np.ndarray:
    return np.isin(owner, [PART_IDS.index(i) for i in ids])


# ---------------------------------------------------------------- bones

@dataclass
class Joint:
    id: str
    parent: str | None
    pivot: tuple[float, float]  # artboard pixels
    limit: float
    children: list['Joint'] = field(default_factory=list)


def joints() -> dict[str, Joint]:
    table: dict[str, Joint] = {}
    for j in ANATOMY['joints']:
        table[j['id']] = Joint(j['id'], j['parent'], (j['pivot'][0] * SIZE, j['pivot'][1] * SIZE), j['limit'])
    # A neck bone at the head pivot carries the neck stub painted on the body
    # plate, so the throat follows the head halfway instead of tearing.
    table['neck'] = Joint('neck', 'chest', table['head'].pivot, 15)
    # Rive limits: the painted arms can now reach above the shoulder.
    for joint, limit in {'upperArmL': 150, 'upperArmR': 150, 'forearmL': 140, 'forearmR': 140, 'pawL': 160, 'pawR': 160, 'head': 20,
                         'tailBase': 20, 'tailMid': 26, 'tailTip': 32}.items():
        table[joint].limit = limit
    # Prop bones: the laptop rests on the ground, the book rides the chest.
    table['desk'] = Joint('desk', 'root', (.63 * SIZE, .82 * SIZE), 30)
    table['bookHold'] = Joint('bookHold', 'chest', (.60 * SIZE, .71 * SIZE), 30)
    for j in table.values():
        if j.parent:
            table[j.parent].children.append(j)
    return table


JOINTS = joints()


# ---------------------------------------------------------------- layers

@dataclass
class Layer:
    name: str
    rgba: np.ndarray            # SIZE x SIZE x 4 float32, straight alpha
    weights: callable           # (nx, ny) arrays -> {bone: weight array}
    step: int = 12              # mesh grid step in artboard px
    x0: int = 0
    y0: int = 0
    texture: Image.Image | None = None


def to_frame(rgba: np.ndarray) -> np.ndarray:
    image = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')
    return np.asarray(image.resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32)


def mask_rgba(rgba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    out[..., 3] *= mask
    return out


def blurred_weights(owner: np.ndarray, bone_of: dict[str, str], sigma: float):
    """Partition-of-unity bone weights: one-hot ownership, Gaussian blurred."""
    size = owner.shape[0]
    bones = sorted(set(bone_of.values()))
    channels = []
    for bone in bones:
        ids = [PART_IDS.index(p) for p, b in bone_of.items() if b == bone]
        channels.append(ndimage.gaussian_filter(np.isin(owner, ids).astype(np.float32), sigma))
    stack = np.stack(channels)
    stack /= np.maximum(stack.sum(0), 1e-6)

    def sample(nx, ny):
        ix = np.clip((nx * size).astype(int), 0, size - 1)
        iy = np.clip((ny * size).astype(int), 0, size - 1)
        return {bone: stack[i][iy, ix] for i, bone in enumerate(bones)}
    return sample


def rigid(bone: str):
    return lambda nx, ny: {bone: np.ones_like(nx)}


def tail_weights(nx, ny):
    base = smooth((ny - .76) / .10) * smooth((nx - .18) / .15)
    tip = 1 - smooth((ny - .60) / .22)
    # The tail polygon also claims the haunch and shoulder contour beside it;
    # that fur stays with the body.
    body = smooth((nx - .34) / .08)
    free = 1 - body
    return {'pelvis': body, 'tailBase': free * base, 'tailMid': free * (1 - base) * (1 - tip), 'tailTip': free * (1 - base) * tip}


def arm_weights(side: str):
    def sample(nx, ny):
        elbow = smooth((ny - .71) / .18)
        wrist = smooth((ny - .865) / .105)
        return {'upperArm' + side: 1 - elbow, 'forearm' + side: elbow * (1 - wrist), 'paw' + side: elbow * wrist}
    return sample


def registered_arm(limbs: np.ndarray, side: str) -> np.ndarray:
    spec = ANATOMY['registeredArt']['arms'][side]
    a, b, c, d, e, f = spec['matrix']
    # dest_n = M src_n  =>  src_n = M^-1 (dest_n - t)
    inv = np.linalg.inv(np.array([[a, c], [b, d]]))
    n = limbs.shape[0]
    ys, xs = np.mgrid[0:n, 0:n]
    dx, dy = (xs + .5) / n - e, (ys + .5) / n - f
    sx = inv[0, 0] * dx + inv[0, 1] * dy
    sy = inv[1, 0] * dx + inv[1, 1] * dy
    cx, cy, cw, ch = spec['crop']
    keep = (sx >= cx) & (sx <= cx + cw) & (sy >= cy) & (sy <= cy + ch)
    out = np.zeros_like(limbs)
    for k in range(4):
        out[..., k] = ndimage.map_coordinates(limbs[..., k], [sy * n - .5, sx * n - .5], order=1, mode='constant')
    out[..., 3] *= keep
    start, end = spec['shoulderBlend']
    out[..., 3] *= smoother(((ys + .5) / n - start) / (end - start))
    return out


def eyelid_patch(painted: np.ndarray) -> np.ndarray:
    """The eye area of a painted eyelid variant, feathered into the face."""
    n = painted.shape[0]
    ys, xs = np.mgrid[0:n, 0:n]
    x, y = (xs + .5) / n, (ys + .5) / n
    alpha = np.zeros((n, n), np.float32)
    for part in ANATOMY['parts']:
        if part['id'] in ('eyeL', 'eyeR'):
            cx, cy, rx, ry = part['ellipse']
            d = np.hypot((x - cx) / (rx * 1.3), (y - cy - ry * .08) / (ry * 1.25))
            alpha = np.maximum(alpha, 1 - smooth((d - .78) / .22))
    out = painted.copy()
    out[..., 3] = np.minimum(out[..., 3], alpha * 255)
    return out


def build_layers() -> list[Layer]:
    original = load(STYLE / 'assets/companion/rig/fallback.png')
    body = load(DRAFTS / 'body-underpaint.png')
    neck = load(DRAFTS / 'neck-underpaint.png')
    ear_roots = load(DRAFTS / 'ear-root-underpaint.png')
    limbs = load(DRAFTS / 'complete-forelimbs.png')
    owner = owner_map(SOURCE)

    head_mask = part_mask(owner, HEAD_GROUP)
    ear_mask = {s: part_mask(owner, {'ear' + s}) for s in 'LR'}
    tail_mask = part_mask(owner, {'tail'})

    # Body plate: everything but tail, head and ears; the neck stub painted
    # behind the chin comes from the neck plate so turning the head never
    # opens a hole.
    body_mask = ~(head_mask | ear_mask['L'] | ear_mask['R'] | tail_mask)
    neck_crop = ANATOMY['registeredArt']['neck']['crop']
    ys, xs = np.mgrid[0:SOURCE, 0:SOURCE]
    in_neck = ((xs + .5) / SOURCE >= neck_crop[0]) & ((xs + .5) / SOURCE <= neck_crop[0] + neck_crop[2]) & \
              ((ys + .5) / SOURCE >= neck_crop[1]) & ((ys + .5) / SOURCE <= neck_crop[1] + neck_crop[3])
    body_layer = mask_rgba(body, body_mask)
    stub = mask_rgba(neck, (head_mask | ear_mask['L'] | ear_mask['R']) & in_neck)
    body_layer = over(body_layer, stub)

    # Tail: it extends under the body by a margin of the body's painted fur,
    # so swinging it never opens a gap at the haunch.
    tail_layer = mask_rgba(body, ndimage.binary_dilation(tail_mask, iterations=30) & ~(head_mask | ear_mask['L'] | ear_mask['R']))

    # Head: original face; where the ears were rooted, the ear-root plate's
    # fur so a turning ear never shows a gap.
    head_layer = mask_rgba(original, head_mask)
    ear_root_fill = mask_rgba(ear_roots, (ear_mask['L'] | ear_mask['R']))
    head_layer = over(head_layer, ear_root_fill)

    def ear_layer(side: str) -> np.ndarray:
        # The ear keeps a margin of head fur below its cut. It sits behind the
        # head, so the margin only shows where a turning ear pulls away.
        base = ndimage.binary_dilation(ear_mask[side], iterations=28) & (head_mask | ear_mask[side])
        return mask_rgba(original, base)

    def prop(file: str, box, scale: float, at) -> np.ndarray:
        """Crop a painted prop, scale it (1 = source scale) and place its box
        centre at normalized `at`, on a full source-size canvas."""
        image = Image.open(DRAFTS / file).convert('RGBA').crop(box)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        canvas = Image.new('RGBA', (SOURCE, SOURCE))
        canvas.alpha_composite(image, (round(at[0] * SOURCE - image.width / 2), round(at[1] * SOURCE - image.height / 2)))
        return np.asarray(canvas, dtype=np.float32)

    laptop = over(load(DRAFTS / 'working-device.png'), load(DRAFTS / 'working-base-complete-v1.png'))
    book = prop('reading-parts.png', (60, 212, 648, 589), .62, (.60, .71))
    # Handle end in the right paw at rest; the lens stands above it.
    magnifier = prop('search-magnifier.png', (321, 100, 933, 1154), .38, (.69, .775))

    small = owner_map(320)
    body_weights = blurred_weights(small, BODY_BONE, 5)
    layers = [
        Layer('laptop', to_frame(laptop), rigid('desk'), 64),
        Layer('armR', to_frame(registered_arm(limbs, 'R')), arm_weights('R'), 10),
        Layer('magnifier', to_frame(magnifier), rigid('pawR'), 64),
        Layer('armL', to_frame(registered_arm(limbs, 'L')), arm_weights('L'), 10),
        Layer('book', to_frame(book), rigid('bookHold'), 64),
        Layer('lidsClosed', to_frame(eyelid_patch(load(STYLE / 'assets/companion/painted/closed-eye.png'))), rigid('head'), 24),
        Layer('lidsHalf', to_frame(eyelid_patch(load(STYLE / 'assets/companion/painted/half-eye.png'))), rigid('head'), 24),
        Layer('head', to_frame(head_layer), rigid('head'), 24),
        Layer('earR', to_frame(ear_layer('R')), rigid('earR'), 24),
        Layer('earL', to_frame(ear_layer('L')), rigid('earL'), 24),
        Layer('body', to_frame(body_layer), body_weights, 12),
        Layer('tail', to_frame(tail_layer), tail_weights, 12),
    ]
    for layer in layers:
        crop(layer)
    return layers


def over(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """b composited under a (straight alpha)."""
    aa, ba = a[..., 3:] / 255, b[..., 3:] / 255
    out_a = aa + ba * (1 - aa)
    rgb = (a[..., :3] * aa + b[..., :3] * ba * (1 - aa)) / np.maximum(out_a, 1e-6)
    return np.concatenate([rgb, out_a * 255], -1)


def crop(layer: Layer) -> None:
    alpha = layer.rgba[..., 3] > 1
    ys, xs = np.nonzero(alpha)
    pad = 2
    x0, x1 = max(0, xs.min() - pad), min(SIZE, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(SIZE, ys.max() + pad + 1)
    layer.x0, layer.y0 = int(x0), int(y0)
    layer.rgba = layer.rgba[y0:y1, x0:x1]
    layer.texture = Image.fromarray(np.clip(layer.rgba, 0, 255).astype(np.uint8), 'RGBA')


# ---------------------------------------------------------------- mesh

def varuint(values) -> bytes:
    out = bytearray()
    for v in values:
        while True:
            byte = v & 0x7f
            v >>= 7
            if v:
                out.append(byte | 0x80)
            else:
                out.append(byte)
                break
    return bytes(out)


def mesh(layer: Layer):
    """Grid mesh over the layer's opaque cells. Returns vertices, triangles."""
    h, w = layer.rgba.shape[:2]
    step = layer.step
    cols, rows = int(np.ceil(w / step)), int(np.ceil(h / step))
    alpha = layer.rgba[..., 3] > 1
    used = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            used[r, c] = alpha[r * step:(r + 1) * step, c * step:(c + 1) * step].any()
    used = ndimage.binary_dilation(used)
    index: dict[tuple[int, int], int] = {}
    vertices, triangles = [], []

    def vertex(c, r):
        key = (c, r)
        if key not in index:
            x, y = min(c * step, w), min(r * step, h)
            index[key] = len(vertices)
            vertices.append((x, y))
        return index[key]
    for r in range(rows):
        for c in range(cols):
            if used[r, c]:
                a, b, d, e = vertex(c, r), vertex(c + 1, r), vertex(c + 1, r + 1), vertex(c, r + 1)
                triangles += [a, b, d, a, d, e]
    return vertices, triangles


def packed_weights(weights: dict[str, float], tendons: list[str]):
    items = sorted(((w, b) for b, w in weights.items() if w > 1e-3), reverse=True)[:4]
    total = sum(w for w, _ in items)
    values = [round(w / total * 255) for w, _ in items]
    values[0] += 255 - sum(values)
    indices = values_packed = 0
    for slot, ((_, bone), value) in enumerate(zip(items, values)):
        indices |= (tendons.index(bone) + 1) << (8 * slot)
        values_packed |= value << (8 * slot)
    return values_packed, indices


def world_pivot(bone: str) -> tuple[float, float]:
    return JOINTS[bone].pivot


def mesh_xml(layer: Layer, ids, asset_id: str, image_id: str) -> str:
    vertices, triangles = mesh(layer)
    xs = np.array([layer.x0 + v[0] for v in vertices], np.float64) / SIZE
    ys = np.array([layer.y0 + v[1] for v in vertices], np.float64) / SIZE
    per_bone = layer.weights(xs, ys)
    tendons = sorted(b for b, w in per_bone.items() if np.max(w) > 1e-3)
    h, w = layer.rgba.shape[:2]
    hidden = ' opacity="0"' if layer.name in HIDDEN_AT_REST else ''
    lines = [f'<Image x="{layer.x0}" y="{layer.y0}" originX="0" originY="0"{hidden} assetId="{asset_id}" name="{layer.name}" id="{image_id}">',
             f' <Mesh triangleIndexBytes="{base64.b64encode(varuint(triangles)).decode()}" name="{layer.name} mesh" id="{ids()}">']
    for i, (x, y) in enumerate(vertices):
        values, indices = packed_weights({b: float(per_bone[b][i]) for b in tendons}, tendons)
        lines.append(f'  <MeshVertex x="{x}" y="{y}" u="{x / w:.6f}" v="{y / h:.6f}"><Weight values="{values}" indices="{indices}"/></MeshVertex>')
    lines.append(f'  <Skin tx="{layer.x0}" ty="{layer.y0}" name="{layer.name} skin">')
    for bone in tendons:
        px, py = world_pivot(bone)
        lines.append(f'   <Tendon boneId="{BONE_IDS[bone]}" tx="{px:.3f}" ty="{py:.3f}" name="{bone}"/>')
    lines += ['  </Skin>', ' </Mesh>', '</Image>']
    return '\n'.join(lines)


BONE_IDS: dict[str, str] = {}


def bones_xml(ids) -> str:
    def emit(joint: Joint, parent: Joint | None, depth: int) -> list[str]:
        BONE_IDS[joint.id] = ids()
        x = joint.pivot[0] - (parent.pivot[0] if parent else 0)
        y = joint.pivot[1] - (parent.pivot[1] if parent else 0)
        pad = ' ' * depth
        head = f'{pad}<RootBone x="{x:.3f}" y="{y:.3f}" length="4" name="{joint.id}" id="{BONE_IDS[joint.id]}"'
        if not joint.children:
            return [head + '/>']
        out = [head + '>']
        for child in joint.children:
            out += emit(child, joint, depth + 1)
        return out + [pad + '</RootBone>']
    return '\n'.join(emit(JOINTS['root'], None, 1))
