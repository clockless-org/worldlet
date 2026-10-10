"""Package uv.exe for Worldlet's own tools Python; nothing else (no built-in Hermes since 2026-10-09).

The folder keeps its old name, HermesBootstrap, which the installers expect."""
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

target = Path(sys.argv[1]).resolve()
if target.exists():
    raise SystemExit('Bootstrap destination must be new')


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()

# Pin the official wheel by version and validate its published SHA-256 before
# extracting the installer. The generated bootstrap is part of the signed app.
version = '0.12.15'
metadata = json.loads(fetch(f'https://pypi.org/pypi/uv/{version}/json'))
wheel = next(item for item in metadata['urls'] if item['filename'] == f'uv-{version}-py3-none-win_amd64.whl')
data = fetch(wheel['url'])
if hashlib.sha256(data).hexdigest() != wheel['digests']['sha256']:
    raise SystemExit('uv download failed integrity verification')
target.mkdir(parents=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    with (target / 'uv.exe').open('wb') as output:
        output.write(archive.read('uv-0.12.15.data/scripts/uv.exe'))
(target / 'uv.sha256').write_text(hashlib.sha256((target / 'uv.exe').read_bytes()).hexdigest() + '\n', encoding='ascii')
print('Packaged uv for the local tools')
