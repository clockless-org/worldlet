"""Build the Windows first-run bootstrap; no developer environment is shipped."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1]).resolve()
if target.exists():
    raise SystemExit('Bootstrap destination must be new')
spec = json.loads((root / 'harness/hermes/runtime.json').read_text(encoding='utf-8'))
revision = spec['revision']
if len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
    raise SystemExit('Invalid Hermes revision')
source_digest = spec.get('sourceZipSHA256', '')
if not isinstance(source_digest, str) or len(source_digest) != 64 or any(c not in '0123456789abcdef' for c in source_digest):
    raise SystemExit('Pin the Windows Hermes source ZIP SHA-256 in runtime.json')

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
# The source archive is downloaded and verified at first use, not shipped here.
# Keep its reviewed digest pinned, just like the Mac tarball, instead of fetching
# 80 MB on every build and trusting whatever that download happens to contain.
target.mkdir(parents=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    with (target / 'uv.exe').open('wb') as output:
        output.write(archive.read('uv-0.12.15.data/scripts/uv.exe'))
shutil.copy2(root / 'harness/hermes/runtime.json', target / 'runtime.json')
# Hash-pinned session SDK and web search wheels, including transitive dependencies.
requirements = (root / 'harness/hermes/windows-requirements.txt').read_text(encoding='utf-8')
for key in ('sessionSDK', 'webSearchDependency'):
    if f'\n{spec[key]} \\\n' not in requirements:
        raise SystemExit(f'Regenerate harness/hermes/windows-requirements.txt for {spec[key]}')
(target / 'windows-requirements.txt').write_text(requirements, encoding='utf-8', newline='\n')
(target / 'source.sha256').write_text(source_digest + '\n', encoding='ascii')
(target / 'uv.sha256').write_text(hashlib.sha256((target / 'uv.exe').read_bytes()).hexdigest() + '\n', encoding='ascii')
print('Packaged Windows Hermes bootstrap for', revision)
