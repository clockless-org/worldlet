"""Desktop authorization for Hermes' bundled Google Workspace API client."""
import asyncio
import datetime
import json
import os
from pathlib import Path

SCOPES = {
    "gmail-send": "https://www.googleapis.com/auth/gmail.send",
    "gmail": "https://www.googleapis.com/auth/gmail.readonly",
    # The reader uses only calendars/primary; shared calendars are not imported.
    "google-calendar": "https://www.googleapis.com/auth/calendar.events.owned.readonly",
    "google-drive": "https://www.googleapis.com/auth/drive.readonly",
}


def disconnect(home):
    """Forget this profile's credentials without revoking other installations.

    Google's revoke endpoint invalidates the project's entire grant, including
    other clients/devices. Global revocation belongs in Google Account settings.
    """
    home = Path(home)
    for name in ("google_token.json", "google_token.pending", "google_profile.json", "google_profile.pending"):
        (home / name).unlink(missing_ok=True)


# Files that hold Google credentials or account metadata in a Hermes profile.
PRIVATE_FILES = ("google_token.json", "google_profile.json", "google_client_secret.json")


def owner_only_windows(file):
    """The Windows 0600: a protected DACL for the signed-in user, SYSTEM and
    Administrators. Nothing is inherited from the profile folder, whose ACL other
    software may have widened, and a file moved in keeps no ACE of its old folder."""
    import ctypes
    from ctypes import wintypes
    advapi, kernel = ctypes.WinDLL("advapi32", use_last_error=True), ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    advapi.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    advapi.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    advapi.ConvertSidToStringSidW.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_wchar_p)]
    advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    advapi.GetSecurityDescriptorDacl.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.BOOL), ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.BOOL)]
    advapi.SetNamedSecurityInfoW.argtypes = [wintypes.LPCWSTR, ctypes.c_int, wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
    def check(ok):
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())
    token = wintypes.HANDLE()
    check(advapi.OpenProcessToken(kernel.GetCurrentProcess(), 0x0008, ctypes.byref(token)))  # TOKEN_QUERY
    try:
        size = wintypes.DWORD()
        advapi.GetTokenInformation(token, 1, None, 0, ctypes.byref(size))  # TokenUser
        buffer = ctypes.create_string_buffer(size.value)
        check(advapi.GetTokenInformation(token, 1, buffer, size, ctypes.byref(size)))
    finally:
        kernel.CloseHandle(token)
    text = ctypes.c_wchar_p()
    check(advapi.ConvertSidToStringSidW(ctypes.c_void_p.from_buffer(buffer).value, ctypes.byref(text)))
    sid = text.value
    kernel.LocalFree(text)
    descriptor = ctypes.c_void_p()
    check(advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW(f"D:P(A;;FA;;;{sid})(A;;FA;;;SY)(A;;FA;;;BA)", 1, ctypes.byref(descriptor), None))
    try:
        present, defaulted, dacl = wintypes.BOOL(), wintypes.BOOL(), ctypes.c_void_p()
        check(advapi.GetSecurityDescriptorDacl(descriptor, ctypes.byref(present), ctypes.byref(dacl), ctypes.byref(defaulted)))
        # SE_FILE_OBJECT; DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION
        status = advapi.SetNamedSecurityInfoW(str(file), 1, 0x80000004, None, None, dacl, None)
        if status:
            raise ctypes.WinError(status)
    finally:
        kernel.LocalFree(descriptor)


def write_private(file, text):
    """Owner-only from the first byte, then atomic replace: readers never see a
    partial file, and an interrupted write never leaves a readable copy behind."""
    file = Path(file)
    temporary = file.with_suffix(".pending")
    temporary.unlink(missing_ok=True)  # O_EXCL: a stale pending file never keeps its old mode.
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    try:
        try:
            if os.name == "nt":
                owner_only_windows(temporary)  # Before any byte; the rename keeps this DACL.
            handle = os.fdopen(descriptor, "w", encoding="utf-8")
        except BaseException:
            os.close(descriptor)  # Windows cannot remove a file that is still open.
            raise
        with handle:
            handle.write(text)
        temporary.replace(file)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def harden(home):
    """Tighten credential files to owner-only. Hermes' Google client refreshes the
    token by rewriting the existing file, which keeps whatever mode or ACL it had,
    so an older, copied or moved-in token must be private before it is refreshed."""
    for name in PRIVATE_FILES:
        file = Path(home) / name
        try:
            if not file.is_file() or file.is_symlink():
                continue
            if os.name == "nt":
                owner_only_windows(file)
            elif file.stat().st_mode & 0o077:
                file.chmod(0o600)
        except OSError:
            pass


def save_token(token_file, credentials):
    write_private(token_file, credentials.to_json())


def reuse_gmail_authorization(home):
    """Migrate this profile's existing Gmail grant; never copy another profile."""
    from tools.mcp_oauth import HermesTokenStorage
    from google.oauth2.credentials import Credentials
    home = Path(home)
    destination = home / "google_token.json"
    if destination.exists() or not (home / "google_client_secret.json").exists():
        return
    token = asyncio.run(HermesTokenStorage("gmail", hermes_home=home).get_tokens())
    if not token or not token.refresh_token or SCOPES["gmail"] not in (token.scope or "").split():
        return
    client = json.loads((home / "google_client_secret.json").read_text())["installed"]
    credentials = Credentials(token=None, refresh_token=token.refresh_token,
        token_uri="https://oauth2.googleapis.com/token", client_id=client["client_id"],
        client_secret=client["client_secret"], scopes=(token.scope or "").split())
    credentials.expiry = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=1)
    save_token(destination, credentials)


def connect(services, home, open_url=None):
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google.auth.exceptions import RefreshError
    home = Path(home)
    if not services or any(service not in SCOPES for service in services):
        raise ValueError("Unsupported Google service.")
    # Mail and Calendar share one explicit read-only authorization from either entry.
    # Optional Drive access is never added unless the caller requested it.
    if any(service in ("gmail", "google-calendar") for service in services):
        services = list(dict.fromkeys(["gmail", "google-calendar", *services]))
    client_file = home / "google_client_secret.json"
    if not client_file.exists():
        raise RuntimeError("Google sign-in is not configured for this build yet.")
    harden(home)
    reuse_gmail_authorization(home)
    token_file = home / "google_token.json"
    stored = json.loads(token_file.read_text()) if token_file.exists() else {}
    scopes = stored.get("scopes", [])
    if isinstance(scopes, str):
        scopes = scopes.split()
    required = {SCOPES[service] for service in services}
    reusable = required.issubset(set(scopes))
    if reusable:
        # A saved scope is not proof the grant still works. A manual reconnect
        # must escape invalid_grant, while network failures preserve credentials.
        credentials = Credentials.from_authorized_user_info(stored)
        try:
            credentials.refresh(Request())
        except RefreshError as error:
            if not any(code in str(error) for code in ['invalid_grant', 'invalid_token']):
                raise
            reusable = False
        else:
            save_token(token_file, credentials)
    if not reusable:
        # Preserve the core Mail/Calendar grant, but do not bring optional
        # services back into consent unless explicitly requested. Retired Calendar
        # scopes are intentionally absent; new consent must not carry them forward.
        core_scopes = {SCOPES["gmail"], SCOPES["google-calendar"], SCOPES["gmail-send"]}
        requested = sorted(required | (set(scopes) & core_scopes) | {"openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"})
        flow = InstalledAppFlow.from_client_secrets_file(str(client_file), scopes=requested, autogenerate_code_verifier=True)
        browser = None
        if open_url is not None:
            import webbrowser
            class NativeBrowser(webbrowser.BaseBrowser):
                def open(self, url, new=0, autoraise=True):
                    open_url(url)
                    return True
            browser = 'worldlet-native-google'
            webbrowser.register(browser, None, NativeBrowser())
        credentials = flow.run_local_server(port=0, open_browser=True, browser=browser, timeout_seconds=300,
            access_type="offline", prompt="select_account consent",
            authorization_prompt_message="Complete Google authorization in your browser.",
            success_message="Google authorization received. You can return to Worldlet.")
        if not credentials or not credentials.has_scopes(requested):
            raise RuntimeError("Google authorization did not grant the requested access.")
        save_token(token_file, credentials)
    # Keep the experimental remote connector out of the active tool set.
    from hermes_cli.mcp_config import _get_mcp_servers, _save_mcp_server
    for service in services:
        previous = _get_mcp_servers().get(service)
        if previous:
            _save_mcp_server(service, {**previous, "enabled": False})
    return {"ok": True}
