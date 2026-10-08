"""Own-account metadata only. Never derive a name from mailbox contents."""
import hashlib
import hmac
import json
import os
import time
from pathlib import Path


def account_id(email):
    """Analytics Person ID. WORLDLET_ANALYTICS_ID_KEY switches it to a keyed HMAC; setting it starts new Person IDs."""
    key = os.environ.get("WORLDLET_ANALYTICS_ID_KEY", "")
    digest = hmac.new(key.encode(), email.encode(), hashlib.sha256) if key else hashlib.sha256(email.encode())
    return "google-" + digest.hexdigest()


def remember(home, email):
    home = Path(home)
    email = email.strip().lower()
    if not email or "@" not in email or len(email) > 320:
        return
    file = home / "google_profile.json"
    try:
        old = json.loads(file.read_text())
    except (OSError, ValueError):
        old = {}
    user_id = account_id(email)
    if old.get("email") == email and old.get("user_id") == user_id and time.time() - old.get("checked", 0) < 86400:
        return
    profile = {"email": email, "user_id": user_id, "checked": time.time()}
    if old.get("email") == email and old.get("name"):
        profile["name"] = old["name"]
    # Old read-only grants need no reauthorization. Their email still identifies
    # the owner; display name is optional until the next explicit sign-in.
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import AuthorizedSession
        credentials = Credentials.from_authorized_user_info(json.loads((home / "google_token.json").read_text()))
        if credentials.has_scopes(["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"]):
            with AuthorizedSession(credentials) as session:
                response = session.get("https://www.googleapis.com/oauth2/v3/userinfo", timeout=5)
                response.raise_for_status()
                user = response.json()
                if user.get("email_verified") is True and user.get("email", "").lower() == email:
                    name = user.get("name")
                    if isinstance(name, str) and name.strip():
                        profile["name"] = name.strip()[:200]
    except Exception:
        pass  # Profile metadata must never block the actual Google connection.
    from google_direct import write_private
    write_private(file, json.dumps(profile))
