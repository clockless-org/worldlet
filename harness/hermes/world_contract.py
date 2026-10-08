"""World-owned definitions; the Python service and model adapters consume them."""
import json
from pathlib import Path

_CACHE = {}

def schemas():
    """services.json parsed once per file version; callers deepcopy before changing a definition."""
    here = Path(__file__).resolve()
    path = here.with_name('services.json')
    if not path.exists():
        path = here.parents[2] / 'core/tools/services.json'
    stamp = (path, path.stat().st_mtime_ns)
    if _CACHE.get('stamp') != stamp:
        _CACHE.update(stamp=stamp, value=json.loads(path.read_text()))
    return _CACHE['value']

def schema(name):
    return next(value for value in schemas() if value['name'] == name)
