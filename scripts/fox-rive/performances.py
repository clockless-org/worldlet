"""Fox performances as joint curves, sampled into Rive timelines.

Each performance is a function of time (seconds) returning joint controls in
degrees and artboard pixels: {joint: (angle, dx, dy)}, plus layer opacities
for the eyelids ('lidsHalf', 'lidsClosed') and props ('laptop', 'book',
'magnifier'). Positive angles turn clockwise on screen. Joint names are the
anatomy joints (rig.JOINTS): 'neck', the prop bones 'desk' and 'bookHold', and
the body. Paw positions can be given as targets through `reach`, a two-bone
solve in the chest's frame.

The acting follows ui/companion/animation/fox-state-catalog.ts. Hold states loop; brief
states play once and keep their last pose until the portrait asks for another.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

import rig

FPS = 30
TAU = math.tau
S = rig.SIZE


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    t = clamp(x)
    return t * t * t * (10 + t * (-15 + 6 * t))


def pulse(t, start, rise, hold, fall):
    """0 -> 1 over [start, start+rise], holds, back to 0 over `fall`."""
    return ease((t - start) / rise) * (1 - ease((t - start - rise - hold) / fall))


def step(t, start, rise):
    return ease((t - start) / rise)


def wave(t, period, phase=0.0):
    return math.sin(TAU * (t / period + phase))


def lerp(a, b, t):
    return a + (b - a) * t


@dataclass
class Performance:
    duration: float
    pose: Callable[[float], dict]
    loop: bool = True
    blend_ms: int = 400


def merge(*poses: dict) -> dict:
    out: dict = {}
    for pose in poses:
        for joint, value in pose.items():
            if isinstance(value, tuple):
                a, x, y = out.get(joint, (0, 0, 0))
                out[joint] = (a + value[0], x + value[1], y + value[2])
            else:
                out[joint] = max(out.get(joint, 0), value)
    return out


def scale(pose: dict, k: float) -> dict:
    return {j: (v[0] * k, v[1] * k, v[2] * k) if isinstance(v, tuple) else v * k for j, v in pose.items()}


# ------------------------------------------------------------ building blocks

def blink(t, at):
    """Eyelids for one blink starting at `at`."""
    d = t - at
    if d < 0 or d > .26:
        return {}
    return {'lidsHalf': pulse(d, 0, .035, .14, .05), 'lidsClosed': pulse(d, 0, .07, .03, .1)}


def blinks(t, *times):
    return merge(*(blink(t, at) for at in times))


def breathing(t, period, depth=1.0):
    """Seated breathing: chest rises, shoulders and head ride along slightly."""
    b = wave(t, period)
    return {
        'chest': (.8 * depth * b, 0, -1.2 * depth * (b + 1) / 2),
        'neck': (-.4 * depth * b, 0, 0),
        'head': (-.5 * depth * b, 0, 0),
        'upperArmL': (-.6 * depth * b, 0, 0), 'upperArmR': (.6 * depth * b, 0, 0),
        'scarfTail': (2 * depth * wave(t, period, -.15), 0, 0),
    }


def tail_sway(t, period, amount=1.0, phase=0.0):
    return {
        'tailBase': (2.5 * amount * wave(t, period, phase), 0, 0),
        'tailMid': (4 * amount * wave(t, period, phase - .08), 0, 0),
        'tailTip': (6 * amount * wave(t, period, phase - .16), 0, 0),
    }


def tail_swish(t, at, amount=1.0):
    """One full tail swish, tip trailing."""
    d = t - at
    if d < 0 or d > 1.4:
        return {}
    env = pulse(d, 0, .25, .5, .6)
    return {
        'tailBase': (5 * amount * env * math.sin(d * 7), 0, 0),
        'tailMid': (8 * amount * env * math.sin(d * 7 - .6), 0, 0),
        'tailTip': (12 * amount * env * math.sin(d * 7 - 1.2), 0, 0),
    }


def ears(t, period, amount=1.0):
    return {'earL': (2 * amount * wave(t, period, .1), 0, 0), 'earR': (-2 * amount * wave(t, period, .35), 0, 0)}


def ear_flick(t, at, side='L', amount=1.0):
    k = pulse(t, at, .08, .05, .3) * amount
    return {'ear' + side: ((-9 if side == 'L' else 9) * k, 0, 0)}


def scarf(t, amount):
    return {'scarfKnot': (3 * amount, 0, 0), 'scarfTail': (6 * amount, 0, 0)}


def look(turn=0.0, down=0.0):
    """Head attitude: turn tilts the head toward the viewer's right (+) or
    left (-); down lowers the chin. Neck follows a third of the way."""
    return {'head': (5 * turn + 2 * down, 0, 3 * down), 'neck': (2 * turn, 0, 1.5 * down)}


def ears_up(k):
    return {'earL': (5 * k, 0, 0), 'earR': (-5 * k, 0, 0)}


def ears_back(k):
    return {'earL': (-10 * k, 0, 0), 'earR': (10 * k, 0, 0)}


def lids(half=0.0, closed=0.0):
    return {'lidsHalf': half, 'lidsClosed': closed}


def props(laptop=0.0, book=0.0, magnifier=0.0):
    return {'laptop': laptop, 'book': book, 'magnifier': magnifier}


# Arm geometry in artboard pixels (rest pose).
def _p(j):
    return rig.JOINTS[j].pivot


ARM = {s: (_p('upperArm' + s), _p('forearm' + s), _p('paw' + s)) for s in 'LR'}


def reach(side: str, target, paw_turn=0.0, k=1.0, world=None):
    """Joint rotations that put the wrist at `target` (normalized, chest frame)
    with the elbow bending outward. Blended with rest by k."""
    (sx, sy), (ex, ey), (px, py) = ARM[side]
    tx, ty = target[0] * S, target[1] * S
    a, b = math.hypot(ex - sx, ey - sy), math.hypot(px - ex, py - ey)
    dx, dy = tx - sx, ty - sy
    d = clamp(math.hypot(dx, dy), abs(a - b) + 1, a + b - .5)
    heading = math.atan2(dy, dx)
    cos_a = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)
    # Elbow out: to the viewer's left for the left arm, right for the right.
    bend = 1 if side == 'L' else -1
    upper = heading + bend * math.acos(cos_a)
    elbow = (sx + math.cos(upper) * a, sy + math.sin(upper) * a)
    lower = math.atan2(ty - elbow[1], tx - elbow[0])
    rest_upper = math.atan2(ey - sy, ex - sx)
    rest_lower = math.atan2(py - ey, px - ex)
    du = math.degrees(_wrap(upper - rest_upper))
    dl = math.degrees(_wrap(lower - rest_lower)) - du
    # The paw keeps roughly its resting attitude unless turned.
    dp = -(du + dl) * .7 + paw_turn if world is None else world - du - dl
    return {'upperArm' + side: (du * k, 0, 0), 'forearm' + side: (dl * k, 0, 0), 'paw' + side: (dp * k, 0, 0)}


def arm(side: str, upper: float, fore: float, paw: float = 0.0, k: float = 1.0) -> dict:
    """Direct joint angles (degrees). Raised gestures read better driven by
    angle than by a wrist target: the painted limb bends without folding."""
    return {'upperArm' + side: (upper * k, 0, 0), 'forearm' + side: (fore * k, 0, 0), 'paw' + side: (paw * k, 0, 0)}


def _wrap(a):
    return math.atan2(math.sin(a), math.cos(a))


def rest_paw(side):
    return (ARM[side][2][0] / S, ARM[side][2][1] / S)


def toward(side, target, k):
    """Wrist position k of the way from rest to target."""
    r = rest_paw(side)
    return (lerp(r[0], target[0], k), lerp(r[1], target[1], k))


def arm_to(side, target, k, paw_turn=0.0):
    """Reach part way, solving at each in-between point so the wrist travels
    a straight path instead of swinging through the joint angles."""
    if k <= 1e-4:
        return {}
    return reach(side, toward(side, target, k), paw_turn * k)


# Work surface. The laptop sits a little lower than its registered spot so
# the paws rest on its keyboard behind the lid.
DESK = {'desk': (0, 0, .055 * S)}
KEYS = {'L': (.535, .855), 'R': (.675, .855)}


def at_desk(t, typing_l=0.0, typing_r=0.0, k=1.0):
    """Both paws on the keyboard; typing values lift a paw (0..1)."""
    out = merge(DESK, props(laptop=k))
    for side, lift in (('L', typing_l), ('R', typing_r)):
        x, y = KEYS[side]
        out = merge(out, arm_to(side, (x + .004 * lift, y - .03 * lift), k, paw_turn=-8 * lift))
    return out


def taps(t, start, count, gap=.16, length=.12):
    """Sum of key taps (0..1 lift) starting at `start`."""
    v = 0.0
    for i in range(count):
        v = max(v, pulse(t, start + i * gap, length * .45, 0, length * .55))
    return v


def burst(t, start, duration, rate=7.0):
    """Irregular typing burst lift curve."""
    if t < start or t > start + duration:
        return 0.0
    d = t - start
    return max(0.0, math.sin(d * rate * TAU / 2) * (.55 + .45 * math.sin(d * 3.1 + 1)))



# Whole body. The root pivots at the ground under the Fox, so its rotation
# leans the whole body and its translation lifts it off the ground.

def hop(t, at, height=30.0, crouch=7.0, air=.34):
    """One jump: anticipation crouch, take-off stretch, an airborne arc with the
    ears trailing and the hind feet tucked, then a landing squash that settles."""
    d = t - at
    pre = .13
    if d < 0 or d > pre + air + .6:
        return {}
    if d < pre:
        c = ease(d / pre)
        return {'pelvis': (0, 0, crouch * c), 'chest': (0, 0, .6 * crouch * c), 'head': (0, 0, .3 * crouch * c), **ears_back(.3 * c)}
    a = d - pre
    if a < air:
        u = a / air
        lift = 4 * u * (1 - u)
        rise = 1 - u  # moving up early in the arc, down late
        return merge(
            {'root': (0, 0, -height * lift), 'pelvis': (0, 0, crouch * (1 - ease(u * 3)) - 3 * lift), 'chest': (0, 0, -2 * lift)},
            {'thighL': (-7 * lift, 0, 0), 'thighR': (7 * lift, 0, 0), 'footL': (-6 * lift, 0, -6 * lift), 'footR': (6 * lift, 0, -6 * lift)},
            ears_back(.9 * rise * lift + .3), tail_sway(a, air * 2, 1.2 * lift))
    l = a - air
    squash = math.exp(-l * 8) * math.cos(l * 15)
    return merge({'pelvis': (0, 0, crouch * squash), 'chest': (0, 0, .7 * crouch * squash), 'head': (0, 0, 2 * squash)},
                 ears_back(-.6 * squash))


def cheer(k, wiggle=0.0, side='both'):
    """Both paws thrown up overhead; wiggle shakes them."""
    out = {}
    if side in ('both', 'R'):
        out = merge(out, arm('R', -138 + 10 * wiggle, -28 + 14 * wiggle, -10 + 18 * wiggle, k))
    if side in ('both', 'L'):
        out = merge(out, arm('L', 138 + 10 * wiggle, 28 + 14 * wiggle, 10 + 18 * wiggle, k))
    return out


def lean(angle, k=1.0):
    """Whole-body lean from the ground; the head partly rights itself."""
    return {'root': (angle * k, 0, 0), 'head': (-.4 * angle * k, 0, 0)}


def trot(t, k=1.0, period=.5):
    """Walking in place, diagonal gait: a front paw lifts with the opposite
    hind foot, the body rolls over the planted side and bobs each step."""
    if k <= 1e-4:
        return {}
    s = math.sin(TAU * t / period)
    up_l, up_r = max(0.0, s), max(0.0, -s)
    bob = abs(s)
    out = merge(
        {'root': (6 * s * k, 0, -10 * bob * k), 'pelvis': (0, 0, 4 * (1 - bob) * k), 'chest': (-2.5 * s * k, 0, 0)},
        {'head': (-3.5 * s * k, 0, -2.5 * bob * k)},
        {'thighL': (-9 * up_r * k, 0, 0), 'footL': (-6 * up_r * k, 0, -15 * up_r * k), 'thighR': (9 * up_l * k, 0, 0), 'footR': (6 * up_l * k, 0, -15 * up_l * k)},
        tail_sway(t, period * 2, 1.6 * k), scarf(t, .6 * s * k),
        {'earL': (2.5 * s * k, 0, 0), 'earR': (2.5 * s * k, 0, 0)})
    for side, lift in (('L', up_l), ('R', up_r)):
        x, y = rest_paw(side)
        out = merge(out, arm_to(side, (x + (.012 if side == 'L' else -.012) * lift, y - .09 * lift), k, paw_turn=(18 if side == 'L' else -18) * lift))
    return out


def shake(t, at, k=1.0):
    """A full-body shake from the shoulders, fast and damped."""
    d = t - at
    if d < 0 or d > 1.1:
        return {}
    env = pulse(d, 0, .12, .45, .5) * k
    w = math.sin(d * 40)
    return merge({'root': (6 * w * env, 0, 0), 'chest': (-6 * w * env, 0, 0), 'head': (9 * w * env, 0, 0)},
                 {'earL': (-12 * w * env, 0, 0), 'earR': (-12 * w * env, 0, 0)}, tail_sway(d, .16, 2 * env),
                 scarf(d, 1.5 * w * env))


# ------------------------------------------------------------------ states

def idle(t):
    # 8 s loop: breathing, a weight shift side to side, one curious head tilt,
    # an ear flick and two blinks.
    tilt = pulse(t, 2.2, .7, 1.6, .9)
    shift = pulse(t, 4.6, .7, 1.2, .8)
    return merge(
        breathing(t, 4), tail_sway(t, 4, .9), ears(t, 8, .6), lean(2.2 * tilt - 2.6 * shift),
        look(turn=tilt), {'earL': (-3 * tilt, 0, 0), 'earR': (2 * tilt, 0, 0)},
        ear_flick(t, 5.6), blinks(t, 1.3, 6.4))


def greeting(t):
    # Notices you, hops once, leans in with a big wave.
    raise_ = pulse(t, .55, .4, 1.5, .55)
    notice = pulse(t, 0, .3, 2.3, .6)
    w = wave(t - .95, .42) * pulse(t, .95, .12, 1.3, .2)
    return merge(
        breathing(t, 3.2, .7), tail_sway(t, .9, 1.8 * notice), hop(t, 0, 24, 6),
        look(turn=-1.4 * notice), {'head': (2 * w, 0, -2 * notice)}, lean(-4 * raise_ + 1.5 * w),
        ears_up(1.3 * notice), {'chest': (-3 * raise_, 0, 0)},
        arm('R', -128, -40 + 26 * w, 14 * w, raise_),
        blink(t, 2.75))


def listening(t):
    # Forward attention: head dips toward you, right ear leads, small nods.
    nod = pulse(t, 2.4, .25, .1, .35) + pulse(t, 4.9, .25, .1, .35) * .6
    return merge(
        breathing(t, 3.5, .7), tail_sway(t, 9, .5), look(turn=.8, down=.6 + nod),
        {'chest': (0, 0, 2)}, {'earR': (-7, 0, 0), 'earL': (3 + 4 * pulse(t, 3.8, .1, .2, .4), 0, 0)},
        blinks(t, 1.1, 5.5))


def acknowledging(t):
    # Paw to chest, one precise nod.
    paw = pulse(t, .05, .35, .5, .45)
    nod = pulse(t, .35, .2, .05, .3)
    return merge(
        breathing(t, 3, .5), look(down=2.2 * nod), ears_up(.5 * paw),
        arm_to('R', (.66, .755), paw, paw_turn=-10), blink(t, .9))


def thinking(t):
    # Paw under the chin, weight shifted, gaze off to the side; an ear twitch.
    gaze = .6 + .4 * wave(t, 9, .25)
    return merge(
        breathing(t, 4.5, .8), tail_sway(t, 9, .6), look(turn=-1.2 * gaze, down=-.3),
        {'chest': (-1.5, 0, 0), 'pelvis': (-1, 0, 0)},
        arm_to('R', (.648, .67), 1, paw_turn=-15), {'head': (0, 0, 3)}, lids(half=.35),
        ear_flick(t, 3.3, 'R', .8), ear_flick(t, 7.1, 'L', .6), blinks(t, 2.2, 6))


def explaining(t):
    # Open paw, measured gestures, meaningful pauses.
    g1 = pulse(t, .3, .45, 1.1, .5)
    g2 = pulse(t, 3.2, .4, .9, .55)
    g3 = pulse(t, 5.6, .35, .6, .5)
    beat = .6 * pulse(t, 1.0, .15, 0, .25) + .6 * pulse(t, 3.8, .15, 0, .25)
    return merge(
        breathing(t, 4, .7), tail_sway(t, 8, .7),
        arm_to('R', (.80, .70 - .03 * beat), max(g1, g2), paw_turn=-30),
        arm_to('L', (.43, .74), g3, paw_turn=25),
        look(turn=.7 * g1 - .7 * g3 + .4 * g2, down=.4 * beat), ears_up(.4 * (g1 + g2)),
        blinks(t, 2.5, 6.8))


def reading(t):
    # Holds the book, follows a line, turns a page, looks up once.
    turn = pulse(t, 4.3, .35, .25, .4)
    up = pulse(t, 7.2, .35, .7, .45)
    scan = wave(t, 2.2) * (1 - up) * (1 - turn)
    return merge(
        breathing(t, 4, .7), tail_sway(t, 10, .5), props(book=1),
        {'bookHold': (-2 + 1.5 * turn, 0, 0)},
        reach('L', (.475, .735)), reach('R', (lerp(.745, .62, turn), lerp(.735, .70, turn))),
        look(turn=.4 * scan - .3, down=1.6 * (1 - up)), lids(half=.55 * (1 - up)),
        ears_up(.6 * up), blinks(t, 2.8, 8.6))


def searching(t):
    # Raises the magnifier and scans with head, then body.
    hold = step(t, 0, .6)
    scan = wave(t, 4, .75)
    return merge(
        breathing(t, 3.5, .6), tail_sway(t, 6, .9), props(magnifier=hold),
        arm('R', -88 - 5 * scan, -66 + 4 * scan, 134 + 3 * scan, hold),
        look(turn=1.4 * scan * hold, down=.5), {'chest': (-2 * scan * hold, 0, 0)},
        ears_up(.6), blinks(t, 2.1, 5.9))


def comparing(t):
    # Two screen regions: looks left, then right, back to the first, pauses.
    gaze = sum(pulse(t, a, .35, h, .35) * s for a, h, s in ((0, 1.3, -1), (2, 1.5, 1), (4.2, 1.3, -1)))
    return merge(
        breathing(t, 4, .6), tail_sway(t, 8, .5), at_desk(t, typing_l=taps(t, 1.2, 2), typing_r=taps(t, 3.3, 2)),
        look(turn=1.1 * gaze, down=1), {'chest': (1.5 * gaze, 0, 0)}, lids(half=.3),
        blinks(t, 1.8, 6.6))


def planning(t):
    # Considers, reaches out to place an item, pauses, moves it again.
    place = pulse(t, 1.6, .5, .7, .5)
    revise = pulse(t, 4.6, .45, .5, .5)
    return merge(
        breathing(t, 4, .6), tail_sway(t, 8, .5), DESK, props(laptop=1),
        arm_to('L', KEYS['L'], 1),
        arm_to('R', KEYS['R'], 1 - max(place, revise)),
        arm_to('R', (.79, .79), place, paw_turn=-20), arm_to('R', (.74, .75), revise, paw_turn=-20),
        look(turn=-.5 + 1.2 * place + .9 * revise, down=.8), lids(half=.25),
        ear_flick(t, 3.6, 'R', .6), blinks(t, 3.1, 7))


def drafting(t):
    # Two uneven writing bursts, a pause, a reread.
    b = burst(t, .3, 2.2, 8) + burst(t, 3.4, 1.3, 9)
    reread = pulse(t, 5.2, .5, 1.5, .5)
    return merge(
        breathing(t, 4, .6), tail_sway(t, 8, .4),
        at_desk(t, typing_l=b * (1 if math.sin(t * 23) > 0 else .3), typing_r=b * (1 if math.sin(t * 23) <= 0 else .3)),
        look(turn=.4 * wave(t, 3) * (1 - reread) - .6 * reread, down=1.2 - .5 * reread), lids(half=.35),
        blinks(t, 2.9, 6.9))


def calculating(t):
    # Three grouped taps, a deliberate pause, a cross-check and one final input.
    r = taps(t, .4, 3, .18) + taps(t, 1.3, 3, .18) + taps(t, 2.2, 3, .18) + taps(t, 5.2, 1)
    check = pulse(t, 3.4, .4, .9, .4)
    return merge(
        breathing(t, 4, .6), tail_sway(t, 7, .4), at_desk(t, typing_r=r, typing_l=.3 * check),
        look(turn=-.7 * check, down=1.1 - .3 * check), lids(half=.35 * (1 - check)),
        ear_flick(t, 3.7, 'L', .5), blinks(t, 3.0))


def organizing(t):
    # Selects, moves and groups items: alternating sideways sweeps.
    l = pulse(t, .4, .4, .5, .4)
    r = pulse(t, 2.2, .4, .5, .4)
    both = pulse(t, 4.2, .5, .8, .5)
    return merge(
        breathing(t, 4, .6), tail_sway(t, 8, .5), DESK, props(laptop=1),
        arm_to('L', KEYS['L'], 1 - max(l, both)), arm_to('L', (.47, .80), max(l, both)),
        arm_to('R', KEYS['R'], 1 - max(r, both)), arm_to('R', (.75, .80), max(r, both)),
        look(turn=-.8 * l + .8 * r, down=1), lids(half=.25), blinks(t, 2.0, 6.5))


def creating(t):
    # A long input sweep, leaning back to look, then a small precise touch.
    sweep = pulse(t, .3, 1.4, .2, .5)
    back = pulse(t, 2.8, .5, 1.6, .6)
    touch = taps(t, 5.8, 2, .3, .2)
    return merge(
        breathing(t, 4.5, .6), tail_sway(t, 9, .6), DESK, props(laptop=1),
        arm_to('L', KEYS['L'], 1),
        arm_to('R', (KEYS['R'][0], KEYS['R'][1] - .03 * touch), 1 - sweep),
        arm_to('R', (.58 + .14 * clamp((t - .3) / 1.6), .80), sweep, paw_turn=-15),
        look(turn=.6 * back - .3, down=1.1 - 1.2 * back), {'chest': (-2.5 * back, 0, -3 * back)},
        lids(half=.3 * (1 - back)), ears_up(.5 * back), blinks(t, 4.1))


def working(t):
    # Alternating paw bursts at the keyboard, shoulders following.
    b1, b2 = burst(t, .2, 1.8, 7), burst(t, 3.0, 2.0, 6)
    pause = pulse(t, 5.3, .4, 1.4, .4)
    l = b1 * (1 if math.sin(t * 19) > 0 else .2) + b2 * (1 if math.sin(t * 17) > .2 else .2)
    r = b1 * (1 if math.sin(t * 19) <= 0 else .2) + b2 * (1 if math.sin(t * 17) <= .2 else .2)
    return merge(
        breathing(t, 4, .6), tail_sway(t, 8, .5), at_desk(t, l, r),
        {'chest': (1.2 * (l - r), 0, 0)}, look(turn=.3 * wave(t, 4) - .5 * pause, down=1.1 - .3 * pause),
        lids(half=.3 * (1 - pause)), blinks(t, 2.6, 6.2))


def checking(t):
    # Inspects successive regions, pauses on one detail, rechecks.
    gaze = -1.0 * pulse(t, .2, .35, .9, .3) + .4 * pulse(t, 1.8, .35, 1.6, .3) + 1 * pulse(t, 4.2, .35, .9, .3) + .4 * pulse(t, 5.8, .3, .6, .3)
    detail = pulse(t, 2.0, .3, 1.2, .3)
    return merge(
        breathing(t, 4, .6), tail_sway(t, 8, .4), at_desk(t, typing_r=taps(t, 3.5, 1) + taps(t, 6.6, 1)),
        look(turn=gaze, down=1.2 + .5 * detail), {'chest': (0, 0, 2 * detail)},
        lids(half=.3 + .2 * detail), ear_flick(t, 2.4, 'R', .5), blinks(t, 5.2))


def awaiting_user(t):
    # Offers an open paw toward the real control, then waits quietly.
    return merge(
        breathing(t, 4, .7), tail_sway(t, 9, .5),
        reach('R', (.80, .80), paw_turn=-35), look(turn=1.2, down=-.2), ears_up(.7),
        blinks(t, 2.4, 6.1))


def awaiting_service(t):
    # Tools down; glances toward the work once and stays patient.
    glance = pulse(t, 2.5, .5, 1.2, .6)
    return merge(
        breathing(t, 4.5, .8), tail_sway(t, 9, .7), look(turn=-1.2 * glance, down=.3 + .6 * glance),
        ears_up(.3), ear_flick(t, 6.4, 'R', .5), blinks(t, 1.5, 5.6))


def notifying(t):
    # Straightens and raises one paw once toward the item.
    up = pulse(t, .2, .45, 1.1, .55)
    return merge(
        breathing(t, 3, .5), {'pelvis': (0, 0, -4 * up), 'chest': (0, 0, -3 * up)},
        arm('R', -62, -62, -10, up),
        look(turn=1.5 * up, down=-.4 * up), ears_up(up),
        tail_swish(t, .35, .6), blink(t, 1.9))


def urgent(t):
    # Pops up with a hop, waves both paws high to get your attention, holds tall.
    tall = step(t, 0, .4)
    sig = wave(t, .36) * pulse(t, .5, .15, 1.6, .3)
    return merge(
        breathing(t, 2.5, .6), hop(t, 0, 22, 6, .28), hop(t, 2.2, 16, 5, .26),
        {'pelvis': (0, 0, -5 * tall), 'chest': (0, 0, -4 * tall)},
        cheer(tall * pulse(t, .3, .25, 1.8, .4), sig), lean(3 * sig),
        look(turn=1.2 * tall, down=-.5 * tall), ears_up(1.3 * tall), tail_sway(t, .8, 1.2),
        blink(t, 3.3))


def succeeded(t):
    # Done! Jumps up with both paws in the air, lands with a happy eye smile.
    up = pulse(t, .1, .22, 1.0, .5)
    wig = wave(t, .22) * pulse(t, .35, .1, .8, .2)
    smile = pulse(t, .2, .25, 2.0, .35)
    return merge(
        breathing(t, 3, .6), hop(t, .05, 34, 8), hop(t, .85, 18, 5, .26), cheer(up, wig),
        look(down=-.8 * up), lids(closed=smile), ears_up(1.2 * smile),
        tail_swish(t, .4, 1.6), tail_swish(t, 1.3, 1.1), scarf(t, wig))


def blocked(t):
    # Looks down at the unfinished work, then turns to you with an open paw.
    turn = step(t, 1.2, .6)
    return merge(
        breathing(t, 4, .7), tail_sway(t, 9, .3), look(turn=-1 + 2.1 * turn, down=1.4 * (1 - turn) + .3),
        arm_to('R', (.79, .78), turn, paw_turn=-35), ears_back(.6), lids(half=.3 * (1 - turn)),
        blinks(t, 3.2))


def looking(t):
    # Trots a few steps in place, stops, then looks left and right.
    walk = pulse(t, 0, .25, 1.55, .3)
    left = pulse(t, 2.1, .4, .6, .35)
    right = pulse(t, 3.1, .35, .4, .35)
    return merge(
        breathing(t, 4.2, .7), trot(t, walk), tail_sway(t, 4.2, .6),
        {'earL': (-8 * left, 0, 0), 'earR': (8 * right, 0, 0)},
        look(turn=-1.7 * left + 1.7 * right, down=-.3 * (left + right)), lean(-3 * left + 3 * right),
        blink(t, 1.9))


def grooming(t):
    # Brushes chest fur with the paw, checks it, plants the paw.
    k = pulse(t, .2, .45, 2.8, .5)
    stroke = wave(t, .9) * pulse(t, .7, .2, 2, .3)
    return merge(
        breathing(t, 4.4, .6), tail_sway(t, 4.4, .5),
        arm_to('R', (.65 + .012 * stroke, .745 + .02 * stroke), k, paw_turn=-12),
        look(turn=-.5 * k, down=2 * k), lids(half=.7 * k), ears(t, 2, .5 * k), scarf(t, .5 * stroke * k),
        blink(t, 3.9))


def stretching(t):
    # Rises tall with both paws reaching overhead, back long, eyes closed.
    s = pulse(t, .2, .8, 1.2, 1.0)
    return merge(
        breathing(t, 3.6, .4), {'root': (0, 0, -10 * s), 'pelvis': (0, 0, -8 * s), 'chest': (0, 0, -8 * s)},
        cheer(s * .95), lean(2.5 * wave(t, 2.4) * s),
        look(turn=-.6 * s, down=-1.8 * s), lids(closed=s), ears_back(.8 * s),
        tail_sway(t, 1.8, 1.2 * s))


def yawning(t):
    # Inhale, eyes close, paw covers the yawn, exhale and plant the paw.
    inhale = pulse(t, 0, .7, 1.2, .8)
    cover = pulse(t, .6, .4, .9, .5)
    return merge(
        breathing(t, 3, .3), {'chest': (0, 0, -4 * inhale)},
        arm_to('R', (.655, .69), cover, paw_turn=-15), look(turn=-.4 * inhale, down=-1.4 * inhale),
        lids(half=inhale, closed=cover), ears_back(.6 * inhale), tail_sway(t, 3, .4))


def sleeping(t):
    # Head lowered, eyes closed, slow breathing, a rare ear twitch.
    b = wave(t, 5)
    return merge(
        {'chest': (.5 * b, 0, 1.5 - 1.6 * (b + 1) / 2), 'head': (6, 0, 9), 'neck': (3, 0, 4)},
        {'earL': (-7, 0, 2), 'earR': (7, 0, 2)}, ear_flick(t, 7.3, 'R', .7),
        tail_sway(t, 10, .3), lids(closed=1), {'scarfTail': (2 * b, 0, 0)})


def waking(t):
    # An ear reacts, eyes open, head rises, then a full-body shake.
    rise = step(t, .3, .7)
    eyes = step(t, .2, .4)
    return merge(
        breathing(t, 2.2, .5),
        {'head': (6 * (1 - rise), 0, 9 * (1 - rise)), 'neck': (3 * (1 - rise), 0, 4 * (1 - rise))},
        {'earL': (-7 * (1 - rise), 0, 0), 'earR': (7 * (1 - step(t, 0, .25)), 0, 0)},
        shake(t, 1.0), lids(half=1 - step(t, .6, .3), closed=1 - eyes), ears_up(.5 * rise))


def pickup(t):
    # Lifted: legs paddle in the air, body swings, tail and scarf trail.
    sway = wave(t, 1.6)
    pad = math.sin(TAU * t / .45)
    return merge(
        {'root': (5 * sway, 0, -12), 'pelvis': (0, 0, 3)},
        reach('L', (.53, .86 - .02 * max(0, pad))), reach('R', (.68, .86 - .02 * max(0, -pad))),
        {'thighL': (8 + 5 * pad, 0, 0), 'thighR': (-8 + 5 * pad, 0, 0), 'footL': (10, 0, 4 - 4 * pad), 'footR': (-10, 0, 4 + 4 * pad)},
        tail_sway(t, 1.6, 2, .2), scarf(t, 1.4 * sway), ears_back(.5), look(down=-.4), lids(half=.15),
        blink(t, 1.2))


def settle(t):
    # Lands: a squash and a damped bounce.
    c = math.exp(-t * 5) * math.cos(t * 14)
    return merge(
        {'root': (0, 0, -12 * math.exp(-t * 9))}, {'pelvis': (0, 0, 6 * c), 'chest': (0, 0, 5 * c)},
        {'head': (0, 0, 3.5 * c)}, ears_back(-.8 * c), tail_swish(t, 0, .7))


def delighted(t):
    # Bounces with joy: three springy hops, paws up and wiggling, tail going.
    joy = pulse(t, .05, .25, 2.4, .5)
    wig = wave(t, .26) * joy
    return merge(
        breathing(t, 2, .6), hop(t, 0, 26, 6, .3), hop(t, .82, 22, 5, .28), hop(t, 1.58, 16, 4, .26),
        cheer(joy, wig), lean(5 * wig), lids(closed=joy), look(turn=-.8 * joy, down=-.5 * joy), ears_up(joy),
        tail_sway(t, .45, 2.2 * joy), scarf(t, wig))


def farewell(t):
    # A big goodbye wave leaning in, a little hop and a bow.
    raise_ = pulse(t, .1, .35, 1.3, .45)
    w = wave(t - .45, .45) * pulse(t, .45, .12, 1.0, .2)
    bow = pulse(t, 1.75, .3, .25, .3)
    return merge(
        breathing(t, 2.6, .5), ears_up(.7 * raise_), hop(t, 1.35, 14, 4, .24),
        arm('R', -125, -42 + 24 * w, 14 * w, raise_), lean(-4 * raise_ + 2 * w),
        look(turn=-.8 * raise_, down=2.4 * bow), {'chest': (0, 0, 4 * bow)}, lids(half=.6 * bow), tail_sway(t, .9, 1.2))


# Hold states loop; brief ones play once (their catalog mode).
PERFORMANCES: dict[str, Performance] = {
    'idle': Performance(8, idle),
    'greeting': Performance(3.2, greeting, loop=False),
    'listening': Performance(6, listening, blend_ms=250),
    'acknowledging': Performance(1.4, acknowledging, loop=False, blend_ms=250),
    'thinking': Performance(9, thinking),
    'explaining': Performance(8, explaining),
    'reading': Performance(9, reading, blend_ms=500),
    'searching': Performance(8, searching, blend_ms=500),
    'comparing': Performance(8, comparing, blend_ms=500),
    'planning': Performance(8, planning, blend_ms=500),
    'drafting': Performance(8, drafting, blend_ms=500),
    'calculating': Performance(7, calculating, blend_ms=500),
    'organizing': Performance(8, organizing, blend_ms=500),
    'creating': Performance(9, creating, blend_ms=500),
    'working': Performance(8, working, blend_ms=500),
    'checking': Performance(8, checking, blend_ms=500),
    'awaiting_user': Performance(8, awaiting_user, blend_ms=600),
    'awaiting_service': Performance(9, awaiting_service, blend_ms=600),
    'notifying': Performance(2.4, notifying, loop=False),
    'urgent': Performance(4, urgent),
    'succeeded': Performance(2.8, succeeded, loop=False),
    'blocked': Performance(6, blocked, loop=False, blend_ms=500),
    'looking': Performance(4.2, looking, loop=False),
    'grooming': Performance(4.4, grooming, loop=False),
    'stretching': Performance(3.6, stretching, loop=False),
    'yawning': Performance(3, yawning, loop=False),
    'sleeping': Performance(10, sleeping, blend_ms=900),
    'waking': Performance(2.2, waking, loop=False, blend_ms=300),
    'pickup': Performance(3.6, pickup, blend_ms=200),
    'settle': Performance(.8, settle, loop=False, blend_ms=120),
    'delighted': Performance(3.2, delighted, loop=False),
    'farewell': Performance(2.6, farewell, loop=False),
}
