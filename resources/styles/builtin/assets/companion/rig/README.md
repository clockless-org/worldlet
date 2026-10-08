# Fox reference painting

`fallback.png` is the approved painted Fox. It is the identity reference for every
Fox surface and is used in three places:

- the portrait's painted fallback and the static portrait (`assets/<theme>-portrait.png`, also `assets/fox-startup.png`),
  through `companion.painted.original` and `companion.portrait` in the style manifest;
- the input the [Rive Fox](../rive/README.md) generator (`scripts/fox-rive/rig.py`)
  cuts into its skinned layers;
- the base of the draft anatomy rig in development.

The earlier layered parts (`parts.png`, `torso.png`) and the renderers that used them
were removed once the Rive Fox shipped; they are recoverable from Git history.
