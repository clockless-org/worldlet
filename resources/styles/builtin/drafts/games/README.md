# Games area devices

The game Applets drawn here (2048, Snake, Minesweeper, Sudoku, Random game and Garden) share one device: the painted wooden stand, brass rim and game controller of the existing `steam` Peek sprite, with a game-specific face painted into the disk. No image model was used and no third-party artwork was added.

- `faces.py` draws each face (our own shapes; digits in DejaVu Sans Bold).
- `compose.py` maps the face onto the disk with an affine fit that keeps verticals vertical, keeps the controller and rim pixels untouched, and adds the disk's own light falloff and a light paint grain.

Run `python3 resources/styles/builtin/drafts/games/compose.py [key…]` (Pillow and NumPy) to rewrite `assets/applets/<key>/peek-logo-v3.png` for every game or only the named ones. The output is deterministic.
