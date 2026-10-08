"""Package only a signed installer, never Python or the agent environment."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import urllib.error
import time
import zipfile

def download(url, timeout=120):
    # Release downloads may be briefly rate-limited. Keep failure explicit after
    # bounded retries; no unverified fallback source or revision is substituted.
    for attempt in range(4):
        try:
            return urllib.request.urlopen(url, timeout=timeout)
        except urllib.error.HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == 3:
                raise
            retry_after = error.headers.get('Retry-After', '')
            delay = min(15, max(3, int(retry_after))) if retry_after.isdigit() else 3 * (attempt + 1)
            error.close()
            print(f'Release download HTTP {error.code}; retrying in {delay}s', flush=True)
            time.sleep(delay)


root = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1])
assert not target.exists(), 'Bootstrap destination must be new'
spec = json.loads((root / 'harness/hermes/runtime.json').read_text())
revision = spec['revision']
assert len(revision) == 40 and all(c in '0123456789abcdef' for c in revision)
source_digest = spec['sourceTarSHA256']
assert len(source_digest) == 64 and all(c in '0123456789abcdef' for c in source_digest)
uv = Path(os.environ['WORLDLET_UV']) if os.environ.get('WORLDLET_UV') else root / '.local/bootstrap/bin/uv'
arch = os.environ.get('WORLDLET_TARGET_ARCH', 'arm64')
assert arch in {'arm64', 'x86_64'}
# Official PyPI digests for uv 0.12.15 on Apple silicon: the wheel pip may
# install, and the uv executable inside it (pip copies it byte for byte). The
# executable digest also covers a uv installed earlier by setup-hermes.ts.
arm64_wheel_sha256 = '03b2c763f8b3c5595fa103221bc667e3af0146f8cb327aa06630ebcf5cfe16e9'
arm64_uv_sha256 = 'c1f752966980dc37be8b6a90dcdcc314f689bbc82a2f86071712924f4be799b0'
if arch == 'arm64' and not uv.is_file():
    bootstrap = root / '.local/bootstrap'
    subprocess.run([sys.executable, '-m', 'venv', str(bootstrap)], check=True)
    requirements = bootstrap / 'uv-requirements.txt'
    requirements.write_text(f'uv==0.12.15 --hash=sha256:{arm64_wheel_sha256}\n')
    subprocess.run([str(bootstrap / 'bin/pip'), 'install', '--require-hashes', '--only-binary', ':all:', '--no-deps', '-r', str(requirements)], check=True)
if arch == 'arm64':
    assert hashlib.sha256(uv.read_bytes()).hexdigest() == arm64_uv_sha256, f'{uv} is not the official uv 0.12.15 arm64 executable'
    assert subprocess.check_output([str(uv), '--version'], text=True).startswith('uv 0.12.15 ')
# The app downloads this exact revision at first run and checks the archive
# against the pinned digest. Packaging does not need to download it again.
# This digest was verified in the signed Build 1048 installer for this revision.
target.mkdir(parents=True)
if arch == 'arm64':
    shutil.copy2(uv, target / 'uv')
else:
    # The build host cannot execute Intel code. Pin the official uv wheel by
    # version and digest, then validate the Mach-O slice in build.sh. A Linux
    # package (WORLDLET_TARGET_OS=linux) takes the manylinux x86_64 wheel instead.
    if os.environ.get('WORLDLET_TARGET_OS') == 'linux':
        wheel_name = 'uv-0.12.15-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl'
        wheel_sha256 = 'aee9802f46bae436bd91751bb33ddeb379ef1596b5c19df193219d545d244b60'
    else:
        wheel_name = 'uv-0.12.15-py3-none-macosx_10_12_x86_64.whl'
        wheel_sha256 = 'a1499a507461774f222114732f145d50579e75a3fab0d91ee680c0ed04322552'
    with download('https://pypi.org/pypi/uv/0.12.15/json', timeout=30) as response:
        releases = json.load(response)['urls']
    wheel = next(item for item in releases if item['filename'] == wheel_name)
    assert wheel['digests']['sha256'] == wheel_sha256
    with download(wheel['url'], timeout=120) as response:
        data = response.read()
    assert hashlib.sha256(data).hexdigest() == wheel_sha256
    from io import BytesIO
    with zipfile.ZipFile(BytesIO(data)) as archive, (target / 'uv').open('wb') as output:
        shutil.copyfileobj(archive.open('uv-0.12.15.data/scripts/uv'), output)
    (target / 'uv').chmod(0o755)
shutil.copy2(root / 'harness/hermes/install.sh', target / 'install.sh')
shutil.copy2(root / 'harness/hermes/runtime.json', target / 'runtime.json')
# Hash-pinned session SDK and web search packages, including transitive dependencies.
requirements = (root / 'harness/hermes/mac-requirements.txt').read_text(encoding='utf-8')
for key in ('sessionSDK', 'webSearchDependency'):
    if f'\n{spec[key]} \\\n' not in requirements:
        raise SystemExit(f'Regenerate harness/hermes/mac-requirements.txt for {spec[key]}')
(target / 'mac-requirements.txt').write_text(requirements, encoding='utf-8')
(target / 'source.sha256').write_text(source_digest + '\n')
print('Packaged Hermes bootstrap for', revision)
