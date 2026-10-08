"""Google credential files are owner-only from the first write (CASA readiness, #1677)."""
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
from google_direct import harden, save_token, write_private


class Fake:
    def to_json(self):
        return '{"refresh_token":"fixture-nonfunctional"}'


def mode(file):
    return stat.S_IMODE(file.stat().st_mode)


def dacl(file):
    """The file's DACL in SDDL, e.g. D:P(A;;FA;;;S-1-5-21-…)(A;;FA;;;SY)(A;;FA;;;BA)."""
    import ctypes
    from ctypes import wintypes
    advapi, kernel = ctypes.WinDLL('advapi32'), ctypes.WinDLL('kernel32')
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    advapi.GetNamedSecurityInfoW.argtypes = [wintypes.LPCWSTR, ctypes.c_int, wintypes.DWORD] + [ctypes.c_void_p] * 4 + [ctypes.POINTER(ctypes.c_void_p)]
    advapi.ConvertSecurityDescriptorToStringSecurityDescriptorW.argtypes = [ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.c_wchar_p), ctypes.c_void_p]
    descriptor, text = ctypes.c_void_p(), ctypes.c_wchar_p()
    assert advapi.GetNamedSecurityInfoW(str(file), 1, 4, None, None, None, None, ctypes.byref(descriptor)) == 0
    assert advapi.ConvertSecurityDescriptorToStringSecurityDescriptorW(descriptor, 1, 4, ctypes.byref(text), None)
    value = text.value
    kernel.LocalFree(text); kernel.LocalFree(descriptor)
    return value


def owner_only(file):
    if os.name == 'posix':
        return mode(file) == 0o600
    # Protected (nothing inherited), and only the user, SYSTEM and Administrators.
    return re.fullmatch(r'D:PAI?\(A;;FA;;;S-1-5-[0-9-]+\)\(A;;FA;;;SY\)\(A;;FA;;;BA\)', dacl(file)) is not None


previous = os.umask(0o022)
try:
    with tempfile.TemporaryDirectory() as directory:
        home = Path(directory)
        token = home / 'google_token.json'
        pending = token.with_suffix('.pending')
        if os.name == 'posix':
            # The temporary file is private while its bytes are written, not chmod-ed afterwards.
            seen = []
            real = os.fdopen
            def watch(descriptor, *args, **kwargs):
                seen.append(stat.S_IMODE(os.fstat(descriptor).st_mode))
                return real(descriptor, *args, **kwargs)
            with patch('os.fdopen', side_effect=watch):
                save_token(token, Fake())
            assert seen == [0o600], seen
            assert mode(token) == 0o600 and not pending.exists()
        else:
            save_token(token, Fake())
            assert owner_only(token) and not pending.exists(), dacl(token)
        if os.name == 'posix':
            # A stale, readable pending file from an older build is replaced, never reused.
            pending.write_text('stale'); pending.chmod(0o644)
            save_token(token, Fake())
            assert mode(token) == 0o600 and not pending.exists()
        # An interrupted write leaves no copy behind and keeps the previous token.
        before = token.read_text() if token.exists() else None
        with patch('os.fdopen', side_effect=OSError('synthetic interruption')):
            try:
                write_private(token, 'new')
                raise AssertionError('interruption was swallowed')
            except OSError:
                pass
        assert not pending.exists()
        assert (token.read_text() if token.exists() else None) == before
        # Older, copied or moved-in tokens are tightened before Hermes refreshes them in place.
        for name in ('google_token.json', 'google_profile.json', 'google_client_secret.json'):
            (home / name).unlink(missing_ok=True)
            (home / name).write_text('{}')
            if os.name == 'posix':
                (home / name).chmod(0o644)
        other = home / 'config.yaml'; other.write_text('')
        if os.name == 'posix':
            other.chmod(0o644)
        before_other = mode(other) if os.name == 'posix' else dacl(other)
        assert not owner_only(home / 'google_token.json')
        harden(home)
        for name in ('google_token.json', 'google_profile.json', 'google_client_secret.json'):
            assert owner_only(home / name), name
        assert (mode(other) if os.name == 'posix' else dacl(other)) == before_other, 'only credential files change'
finally:
    os.umask(previous)
print('PASS Google token and profile files are owner-only from the first write, interruption leaves no copy, older files are tightened')
