"""Reuse only an explicitly selected, still-mounted, read-only exact DMG."""
import contextlib
import hashlib
import pathlib
import plistlib
import subprocess
import sys
import tempfile


def digest(path):
    result = hashlib.sha256()
    with open(path, 'rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def identity(images, disk, artifact, mount):
    artifact, mount = pathlib.Path(artifact).resolve(), pathlib.Path(mount).resolve()
    matches = [(image, entity) for image in images.get('images', [])
               for entity in image.get('system-entities', [])
               if entity.get('mount-point') == str(mount)]
    if len(matches) != 1:
        raise ValueError('Selected DMG mount is missing or ambiguous')
    image, entity = matches[0]
    if pathlib.Path(image.get('image-path', '')).resolve() != artifact:
        raise ValueError('Selected mount belongs to a different image')
    if image.get('writeable') is not False or any(
            disk.get(key) is not False for key in ('Writable', 'WritableMedia', 'WritableVolume')):
        raise ValueError('Selected image and mounted volume must be explicitly read-only')
    device = entity.get('dev-entry')
    if not device or disk.get('DeviceNode') != device or disk.get('MountPoint') != str(mount):
        raise ValueError('Selected mount device does not match disk information')
    return (str(artifact), str(mount), device, image.get('hdid-pid'), image.get('owner-uid'))


def observe(artifact, mount):
    def plist(args):
        return plistlib.loads(subprocess.check_output(args, timeout=30))
    return identity(plist(['hdiutil', 'info', '-plist']),
                    plist(['diskutil', 'info', '-plist', str(mount)]), artifact, mount)


@contextlib.contextmanager
def verified_existing_mount(artifact, mount, expected_hash):
    mount = pathlib.Path(mount)
    if mount.is_symlink() or not mount.is_dir():
        raise ValueError('Selected mount must be an existing non-symlink directory')
    before = observe(artifact, mount)
    if digest(artifact) != expected_hash:
        raise ValueError('Mounted artifact hash differs from accepted candidate')
    yield str(mount.resolve())
    if observe(artifact, mount) != before or digest(artifact) != expected_hash:
        raise ValueError('Mounted image changed during validation; publication refused')
    # The Finder/user owns this mount. Never detach it here.


@contextlib.contextmanager
def release_mount(artifact, existing=None, expected_hash=None):
    if existing:
        with verified_existing_mount(artifact, existing, expected_hash) as mount:
            yield mount
    else:
        # hdiutil chooses the mount point under /Volumes. A -mountpoint inside TMPDIR failed with
        # "Permission denied" when the release's temporary root was on an external volume (02, #1063).
        attached = plistlib.loads(subprocess.run(['hdiutil', 'attach', '-readonly', '-nobrowse', '-plist', str(artifact)],
                                                 check=True, capture_output=True).stdout)
        mounts = [e['mount-point'] for e in attached.get('system-entities', []) if e.get('mount-point')]
        if len(mounts) != 1:
            raise ValueError(f'Expected one mounted volume for {artifact}, found {len(mounts)}')
        try:
            yield mounts[0]
        finally:
            subprocess.run(['hdiutil', 'detach', mounts[0]], check=True)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: release_mount.py artifact mount expected-sha256')
    with verified_existing_mount(*sys.argv[1:]):
        pass
    print('PASS exact existing read-only DMG mount; no attach/detach performed')
