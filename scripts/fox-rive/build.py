"""Generate the Rive project for the painted Fox.

  python3 scripts/fox-rive/build.py   # textures, fox.rml, then fox.riv

Needs Python with numpy, scipy and Pillow, and the Rive CLI
(curl -fsSL https://releases.rive.app/cli/install.sh | bash; on Linux it also
needs libegl1 and libgles2).

Writes resources/styles/builtin/assets/companion/rive/{rive.yaml,fox.rml,
states.json,textures/} and compiles fox.riv with the Rive CLI (no account
needed). The .rml is plain text, so the Rive editor or MCP can open and refine
the same rig.
"""
from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rig  # noqa: E402
from performances import PERFORMANCES, FPS  # noqa: E402

OUT = rig.ROOT / 'resources/styles/builtin/assets/companion/rive'


class Ids:
    def __init__(self):
        self.n = 1

    def __call__(self) -> str:
        self.n += 1
        return f'0:{self.n}'


def simplify(values: list[float], tolerance: float) -> list[int]:
    """Frames to key so linear interpolation stays within `tolerance` of
    every sampled value (greedy, end points always kept)."""
    keep, start, last = [0], 0, len(values) - 1
    end = 2
    while end <= last:
        a, b = values[start], values[end]
        span = end - start
        if any(abs(a + (b - a) * (i - start) / span - values[i]) > tolerance for i in range(start + 1, end)):
            keep.append(end - 1)
            start = end - 1
        end += 1
    if keep[-1] != last:
        keep.append(last)
    return keep


def keyed(object_id: str, key: int, values: list[float], tolerance: float) -> list[str]:
    """Keyframes for one property; samples a straight line can reproduce are
    dropped."""
    out = [f'   <KeyedObject objectId="{object_id}">', f'    <KeyedProperty propertyKey="{key}">']
    for frame in simplify(values, tolerance):
        out.append(f'     <KeyFrameDouble value="{values[frame]:.4f}" interpolationType="linear" frame="{frame}"/>')
    return out + ['    </KeyedProperty>', '   </KeyedObject>']


def animation_xml(name: str, perf, ids: Ids, image_ids: dict[str, str]) -> tuple[str, str]:
    anim_id = ids()
    frames = max(1, round(perf.duration * FPS))
    samples = [perf.pose(i / FPS) for i in range(frames + 1)]
    lines = [f'  <LinearAnimation loopValue="{"loop" if perf.loop else "oneShot"}" fps="{FPS}" duration="{frames}" name="{name}" id="{anim_id}">']
    for joint in rig.JOINTS.values():
        bone_id = rig.BONE_IDS[joint.id]
        rot = [math.radians(max(-joint.limit, min(joint.limit, s.get(joint.id, (0, 0, 0))[0]))) for s in samples]
        xs = [s.get(joint.id, (0, 0, 0))[1] for s in samples]
        ys = [s.get(joint.id, (0, 0, 0))[2] for s in samples]
        parent = rig.JOINTS[joint.parent] if joint.parent else None
        bx = joint.pivot[0] - (parent.pivot[0] if parent else 0)
        by = joint.pivot[1] - (parent.pivot[1] if parent else 0)
        lines += keyed(bone_id, 15, rot, .0015)
        lines += keyed(bone_id, 90, [bx + x for x in xs], .06)
        lines += keyed(bone_id, 91, [by + y for y in ys], .06)
    for layer in rig.HIDDEN_AT_REST:
        lines += keyed(image_ids[layer], 18, [s.get(layer, 0.0) for s in samples], .01)
    lines.append('  </LinearAnimation>')
    return anim_id, '\n'.join(lines)


def main() -> None:
    ids = Ids()
    layers = rig.build_layers()
    (OUT / 'textures').mkdir(parents=True, exist_ok=True)
    artboard_id, machine_id, layer_id = ids(), ids(), ids()
    vm_id, vm_state_id, vm_instance_id = ids(), ids(), ids()
    bones = rig.bones_xml(ids)
    assets, images, image_ids = [], [], {}
    for layer in layers:
        asset_id, image_id = ids(), ids()
        image_ids[layer.name] = image_id
        layer.texture.save(OUT / 'textures' / f'{layer.name}.png', optimize=True)
        assets.append(f'<ImageAsset file="textures/{layer.name}.png" name="{layer.name}" id="{asset_id}"/>')
        images.append(rig.mesh_xml(layer, ids, asset_id, image_id))
    animations, states = [], []
    names = list(PERFORMANCES)
    for index, name in enumerate(names):
        anim_id, xml = animation_xml(name, PERFORMANCES[name], ids, image_ids)
        animations.append(xml)
        state_id = ids()
        states.append((index, name, anim_id, state_id))
    # One state per performance. Any State jumps to the requested one and
    # blends from the pose currently on screen, interrupted blends included.
    layer_states = []
    for index, name, anim_id, state_id in states:
        x, y = 200 + (index % 8) * 160, 120 + (index // 8) * 120
        layer_states.append(f'    <AnimationState x="{x}" y="{y}" animationId="{anim_id}" id="{state_id}"/>')
    any_transitions = []
    for index, name, anim_id, state_id in states:
        blend = PERFORMANCES[name].blend_ms
        any_transitions.append(
            f'     <StateTransition stateToId="{state_id}" duration="{blend}">\n'
            f'      <TransitionViewModelCondition opValue="equal">\n'
            f'       <TransitionPropertyViewModelComparator><BindablePropertyNumber><DataBindContext sourcePathIds="{vm_id}-{vm_state_id}" propertyKey="636"/></BindablePropertyNumber></TransitionPropertyViewModelComparator>\n'
            f'       <TransitionValueNumberComparator value="{index}"/>\n'
            f'      </TransitionViewModelCondition>\n'
            f'     </StateTransition>')
    idle_state = states[0][3]
    # Any State fires every frame its condition holds; the self-transition
    # flag stays off, so a state never restarts while it is already playing.
    machine = '\n'.join([
        f'  <StateMachine name="Fox" id="{machine_id}">',
        f'   <StateMachineLayer name="Performance" id="{layer_id}">',
        '    <AnyState x="40" y="-120">', *any_transitions, '    </AnyState>',
        '    <ExitState x="40" y="-240"/>',
        f'    <EntryState x="40" y="0"><StateTransition stateToId="{idle_state}"/></EntryState>',
        *layer_states,
        '   </StateMachineLayer>',
        '  </StateMachine>'])
    rml = '\n'.join([
        '<Rive version="1" kind="fragment">',
        f' <Artboard defaultStateMachineId="{machine_id}" viewModelId="{vm_id}" viewModelInstanceId="{vm_instance_id}" width="{rig.SIZE}" height="{rig.SIZE}" name="Fox" id="{artboard_id}">',
        bones,
        *images,
        machine,
        *animations,
        ' </Artboard>',
        f' <ViewModel defaultInstanceId="{vm_instance_id}" name="Fox" id="{vm_id}">',
        f'  <ViewModelPropertyNumber name="state" id="{vm_state_id}"/>',
        f'  <ViewModelInstance exports="true" name="Default" id="{vm_instance_id}">',
        f'   <ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{vm_state_id}"/>',
        '  </ViewModelInstance>',
        ' </ViewModel>',
        *[' ' + a for a in assets],
        '</Rive>', ''])
    (OUT / 'fox.rml').write_text(rml)
    (OUT / 'rive.yaml').write_text('name: fox\n')
    (OUT / 'states.json').write_text('{\n' + ',\n'.join(f' "{n}": {i}' for i, n in enumerate(names)) + '\n}\n')
    print(f'{len(layers)} layers, {len(names)} performances -> {OUT / "fox.rml"}')
    # Compile with the Rive CLI (https://releases.rive.app/cli/install.sh).
    cli = shutil.which('rive') or os.path.expanduser('~/.rive/bin/rive')
    subprocess.run([cli, str(OUT), '--once'], check=True)
    shutil.move(OUT / 'build/fox.riv', OUT / 'fox.riv')
    shutil.rmtree(OUT / 'build')


if __name__ == '__main__':
    main()
