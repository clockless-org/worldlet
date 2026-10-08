"""Bounded installer-test execution and validation of one interrupted owned fixture."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SMOKE_TIMEOUT = 600
STEP_TIMEOUT = 180
MARKER = b'{"fixture":"personal data must survive"}'

def budget(args):
    return SMOKE_TIMEOUT if len(args) == 2 and args[1] == '--smoke-check' else STEP_TIMEOUT

def run_checked(args, *, cwd, timeout=None, **kwargs):
    limit = budget(args) if timeout is None else timeout
    print('Checking', Path(args[0]).name, args[1] if len(args) > 1 else '', 'budget', limit, flush=True)
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=limit, **kwargs)
    except subprocess.TimeoutExpired as error:
        for stream, value in ((sys.stdout, error.stdout), (sys.stderr, error.stderr)):
            if value:
                stream.write(value.decode('utf-8', errors='replace') if isinstance(value, bytes) else value)
                stream.flush()
        raise RuntimeError(f'{Path(args[0]).name} {args[1:]} timed out after {limit}s; partial output preserved') from error
    if result.stdout:
        print(result.stdout, end='', flush=True)
    if result.stderr:
        print(result.stderr, end='', file=sys.stderr, flush=True)
    if result.returncode:
        raise AssertionError((result.returncode, args))
    return result

def regular(path, directory=False):
    path = Path(path)
    stat = path.lstat()
    if path.is_symlink() or getattr(stat, 'st_file_attributes', 0) & 0x400:
        raise ValueError('Fixture links are not accepted: ' + str(path))
    if not (path.is_dir() if directory else path.is_file()):
        raise ValueError('Unexpected fixture type: ' + str(path))

def validate_resume(install, data, payload, identity):
    """Only an exact completed first installation with the original synthetic marker."""
    install, data, payload = map(Path, (install, data, payload))
    for directory in (install, data, payload, install / 'app'):
        regular(directory, True)
    if {p.name for p in data.iterdir()} != {'world.json'}:
        raise ValueError('Resume data is not the isolated installer fixture')
    regular(data / 'world.json')
    if (data / 'world.json').read_bytes() != MARKER:
        raise ValueError('Synthetic preservation marker differs')
    installed = json.loads((install / 'app/build-identity.json').read_text(encoding='utf-8'))
    for key in ('version', 'build', 'sourceCommit'):
        if installed.get(key) != identity.get(key):
            raise ValueError('Installed candidate identity differs: ' + key)
    checked = 0
    for source in payload.rglob('*'):
        regular(source, source.is_dir())
        target = install / 'app' / source.relative_to(payload)
        regular(target, source.is_dir())
        if source.is_file():
            if hashlib.sha256(source.read_bytes()).digest() != hashlib.sha256(target.read_bytes()).digest():
                raise ValueError('Installed payload changed: ' + str(source.relative_to(payload)))
            checked += 1
    if checked < 2:
        raise ValueError('Incomplete reference payload')
    return checked

# These are disposable outputs of this isolated test, not installer-owned payload.
# Preserve their bytes as evidence before removing only individually verified files.
def normalized_code(code):
    import types
    if not isinstance(code, types.CodeType):
        return code
    return code.replace(co_linetable=b'', co_consts=tuple(normalized_code(c) for c in code.co_consts))

def verified_caches(install, payload, allow_fixture=False):
    import importlib.util
    import io
    import marshal
    import re
    import types
    install, payload = Path(install), Path(payload)
    regular(install, True); regular(payload, True)
    allowed_dirs = {'app', 'app/WorldletWeb', 'app/WorldletWeb/hermes', 'app/WorldletWeb/hermes/__pycache__'}
    found = []
    def visit(directory):
        regular(directory, True)
        for file in directory.iterdir():
            relative = file.relative_to(install).as_posix()
            regular(file, file.is_dir())
            if file.is_dir():
                if relative not in allowed_dirs:
                    raise ValueError('Unexpected residual directory: ' + relative)
                visit(file)
                continue
            if relative == 'app/fixture-user-file.txt' and allow_fixture:
                if file.read_bytes() != b'An untracked file is not installer-owned.':
                    raise ValueError('Preservation fixture changed')
                continue
            if file.parent != install/'app/WorldletWeb/hermes/__pycache__':
                raise ValueError('Unknown uninstall residual: ' + relative)
            match = re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]*)\.cpython-' + str(sys.version_info.major) + str(sys.version_info.minor) + r'\.pyc', file.name)
            if not match or file.stat().st_size > 2 * 1024 * 1024:
                raise ValueError('Not an expected bounded runtime cache: ' + relative)
            source = payload/'WorldletWeb/hermes'/(match[1]+'.py')
            for parent in (payload/'WorldletWeb', payload/'WorldletWeb/hermes'):
                regular(parent, True)
            regular(source)
            content, source_bytes = file.read_bytes(), source.read_bytes()
            if len(content) < 16 or content[:4] != importlib.util.MAGIC_NUMBER or int.from_bytes(content[4:8], 'little') != 0 or int.from_bytes(content[12:16], 'little') != len(source_bytes):
                raise ValueError('Cache header differs from retained source: ' + relative)
            # NSIS payload timestamps have two-second resolution.
            if abs(int.from_bytes(content[8:12], 'little') - int(source.stat().st_mtime)) > 1:
                raise ValueError('Cache source timestamp differs: ' + relative)
            stream = io.BytesIO(content[16:])
            code = marshal.load(stream)  # Never execute cached code.
            if stream.read():
                raise ValueError('Cache contains trailing unknown data: ' + relative)
            expected_path = install/'app/WorldletWeb/hermes'/source.name
            if not isinstance(code, types.CodeType) or Path(code.co_filename) != expected_path:
                raise ValueError('Cache compiled for another path: ' + relative)
            expected = compile(source_bytes, str(expected_path), 'exec', dont_inherit=True, optimize=0)
            # CPython minor patch/debug-range settings can vary line tables, not executable code.
            if normalized_code(code) != normalized_code(expected):
                raise ValueError('Cache code differs from retained source: ' + relative)
            found.append({'path': relative, 'sha256': hashlib.sha256(content).hexdigest(), 'size': len(content), 'source': source.relative_to(payload).as_posix(), 'sourceSha256': hashlib.sha256(source_bytes).hexdigest()})
    visit(install)
    return found

def preserve_caches(install, payload, evidence_parent, allow_fixture=False):
    import uuid
    install, evidence_parent = Path(install), Path(evidence_parent)
    if evidence_parent.resolve().is_relative_to(install.resolve()):
        raise ValueError("Evidence must be outside the test installation")
    records = verified_caches(install, payload, allow_fixture)
    if not records:
        return None
    evidence_parent.mkdir(parents=True, exist_ok=True)
    regular(evidence_parent, True)
    archive = evidence_parent/str(uuid.uuid4())
    archive.mkdir()
    # Validate the complete tree before mutation. Keep evidence even if a later step fails.
    for record in records:
        source = install/record['path']; regular(source)
        content = source.read_bytes()
        if hashlib.sha256(content).hexdigest() != record['sha256']:
            raise ValueError('Cache changed before preservation')
        destination = archive/Path(record['path']).name
        with destination.open('xb') as stream:
            stream.write(content)
        if hashlib.sha256(destination.read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('Evidence copy differs')
    manifest = archive/'manifest.json'
    manifest.write_text(json.dumps({'install': str(install), 'files': records}, indent=2), encoding='utf-8')
    for record in records:
        source = install/record['path']; regular(source)
        if hashlib.sha256(source.read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('Cache changed before cleanup')
        source.unlink()
    for relative in ['app/WorldletWeb/hermes/__pycache__', 'app/WorldletWeb/hermes', 'app/WorldletWeb']:
        directory = install/relative
        if directory.exists():
            regular(directory, True); directory.rmdir()
    print('Preserved source-verified runtime caches:', manifest, flush=True)
    return manifest

def validate_marker(data):
    data = Path(data); regular(data, True)
    if {p.name for p in data.iterdir()} != {'world.json'}:
        raise ValueError('Unexpected preservation data')
    regular(data/'world.json')
    if (data/'world.json').read_bytes() != MARKER:
        raise ValueError('Preservation marker changed')
