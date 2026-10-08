"""Exercise a separately named installer; never install over the user's Worldlet."""
import json
import argparse
from windows_installer_support import run_checked, validate_resume, validate_marker, preserve_caches
import ctypes
import os
from pathlib import Path
import re
import subprocess
import sys
import winreg

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('installer')
parser.add_argument('--resume-installation', action='store_true')
parser.add_argument('--candidate-root', type=Path)
options = parser.parse_args()
root = (options.candidate_root or Path(__file__).resolve().parents[1]).resolve()
installer = Path(options.installer).resolve()
metadata = json.loads(Path(str(installer) + '.json').read_text(encoding='utf-8'))
product = metadata['product']
match = re.fullmatch(r'Worldlet Installer Test ([a-f0-9]{12})', product)
if not match or metadata['appId'] != 'app.worldlet.windows.test.' + match[1]:
    raise SystemExit('Use a --test-id installer; production installation is never a fixture')
install = Path(os.environ['LOCALAPPDATA']) / 'Programs' / product
data = Path(os.environ['LOCALAPPDATA']) / product
shortcut = Path(os.environ['APPDATA']) / 'Microsoft/Windows/Start Menu/Programs' / product / 'Worldlet.lnk'
registry = r'Software\Microsoft\Windows\CurrentVersion\Uninstall' + '\\' + metadata['appId']
cache_evidence = root / '.local/installer-cache-evidence'
resume_installed = options.resume_installation and (install / 'app/Worldlet.exe').exists()
if options.resume_installation and not resume_installed:
    validate_marker(data)
    if shortcut.exists():
        raise SystemExit('Uninstalled fixture still has a shortcut')
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry):
            raise SystemExit('Uninstalled fixture still has registration')
    except FileNotFoundError:
        pass
    preserve_caches(install, root / 'dist/packages/Worldlet-win32-x64', cache_evidence)
    (install / 'app').rmdir(); install.rmdir()
    print('Validated stopped uninstalled fixture; all installation checks will run again', flush=True)
elif resume_installed:
    count = validate_resume(install, data, root / 'dist/packages/Worldlet-win32-x64', metadata)
    if not shortcut.is_file():
        raise SystemExit('Original fixture shortcut missing')
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry) as key:
        if Path(winreg.QueryValueEx(key, 'InstallLocation')[0]) != install:
            raise SystemExit('Original fixture registration differs')
    print('Validated interrupted owned installation:', count, 'exact payload files', flush=True)
else:
    if install.exists() or data.exists() or shortcut.exists():
        raise SystemExit('Test installation paths must be unused: ' + str(install))
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry):
            raise SystemExit('Test installation registration already exists')
    except FileNotFoundError:
        pass

def run(args, **kwargs):
    return run_checked(args, cwd=root, **kwargs)

data.mkdir(exist_ok=options.resume_installation)
personal = data / 'world.json'
if not options.resume_installation:
    personal.write_text('{"fixture":"personal data must survive"}', encoding='utf-8')
original = personal.read_bytes()
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
kernel.CreateMutexW.restype = ctypes.c_void_p
kernel.CloseHandle.argtypes = [ctypes.c_void_p]
mutex = kernel.CreateMutexW(None, 0, 'Local\\' + metadata['appId'] + '.setup')
assert mutex
try:
    blocked = subprocess.run([str(installer), '/S'], cwd=root, timeout=30, capture_output=True)
    assert blocked.returncode == 1 and (options.resume_installation or not install.exists()), 'Concurrent setup must be rejected before mutation'
    if resume_installed:
        validate_resume(install, data, root / 'dist/packages/Worldlet-win32-x64', metadata)
finally:
    kernel.CloseHandle(mutex)
ignored_override = root / '.local' / ('installer-ignored-path-' + match[1])
assert not ignored_override.exists()
run([str(installer), '/S', '/D=' + str(ignored_override)])
assert not ignored_override.exists(), 'Installer directory override must not bypass the fixed program path'
app = install / 'app'
assert (app / 'Worldlet.exe').is_file() and shortcut.is_file(), 'Application and Start menu shortcut'
with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry) as key:
    assert Path(winreg.QueryValueEx(key, 'InstallLocation')[0]) == install
# The installed Electron app carries its interface and first-run helpers, and its main
# process starts and installs every host module (no window, no profile writes).
for resource in ('app.asar', 'WorldletWeb/index.html', 'HermesBootstrap/uv.exe', 'agent-browser.exe', 'build-info.json'):
    assert (app / 'resources' / resource).is_file(), 'Installed package is missing ' + resource
contract = subprocess.run([str(app / 'Worldlet.exe'), '--host-contract-check'], capture_output=True, text=True, timeout=120, check=True)
report = json.loads(next(line for line in contract.stdout.splitlines() if line.startswith('{')))
assert len(report['actions']) >= 100 and 'agent' in report['services'], 'Installed host modules'
unknown = app / 'fixture-user-file.txt'
unknown.write_text('An untracked file is not installer-owned.', encoding='utf-8')
with (app / 'Worldlet.exe').open('rb'):
    blocked = subprocess.run([str(installer), '/S'], cwd=root, timeout=30, capture_output=True)
    assert blocked.returncode == 1, 'In-use program files must prevent upgrade without terminating their owner'
assert personal.read_bytes() == original and unknown.is_file()
with subprocess.Popen([sys.executable, '-c', 'import sys,time; f=open(sys.argv[1],"rb"); print("ready",flush=True); time.sleep(2)', str(app / 'Worldlet.exe')], stdout=subprocess.PIPE, text=True) as closing:
    assert closing.stdout.readline().strip() == 'ready'
    run([str(installer), '/S', '/WAITPID=' + str(closing.pid)])
    closing.wait(timeout=5)
assert (app / 'Worldlet.exe').is_file() and shortcut.is_file(), 'Upgrade restores app and shortcut'
assert personal.read_bytes() == original and unknown.is_file(), 'Upgrade retains data and unknown files'

# Start-Process -Wait tracks the temporary child used by NSIS self-uninstall.
# Use the real uninstall entry, with no in-place/test-only uninstall mode.
powershell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
env = dict(os.environ, WORLDLET_TEST_UNINSTALLER=str(install / 'Uninstall.exe'), PSModulePath=str(powershell.parent / 'Modules'))
def uninstall():
    run([str(powershell), '-NoProfile', '-NonInteractive', '-Command',
         "$p=Start-Process -FilePath $env:WORLDLET_TEST_UNINSTALLER -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode"], env=env)
uninstall()
assert not (app / 'Worldlet.exe').exists() and not shortcut.exists(), 'Uninstaller removes program and shortcut'
assert not (install / 'Uninstall.exe').exists(), 'Uninstaller removes itself'
assert unknown.is_file() and personal.read_bytes() == original, 'Uninstall preserves unknown files and personal data'
try:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry):
        raise AssertionError('Uninstall registration was retained')
except FileNotFoundError:
    pass
# Unowned runtime caches correctly survive uninstall. Preserve only source-verified
# cache bytes and a manifest; reject unknown residuals before deleting our own fixture.
preserve_caches(install, root / 'dist/packages/Worldlet-win32-x64', cache_evidence, allow_fixture=True)
unknown.unlink(); app.rmdir(); install.rmdir()
# Recover a first install interrupted during extraction, keeping its marker.
install.mkdir(); (install / 'staging').mkdir()
(install / 'installing.id').write_text(metadata['appId'], encoding='utf-8')
(install / 'staging/Worldlet.exe').write_bytes(b'interrupted extraction fixture')
run([str(installer), '/S'])
assert (app / 'Worldlet.exe').is_file() and not (install / 'installing.id').exists()
assert not (install / 'staging').exists(), 'Recovered setup removes its completed staging directory'
uninstall()
assert not install.exists() and personal.read_bytes() == original
personal.unlink(); data.rmdir()
print('PASS Windows installer: concurrency, install, packaged UI, in-use rejection, upgrade, interrupted extraction recovery, self-uninstall and data preservation.')
