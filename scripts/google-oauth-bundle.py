"""Stage only the app's installed OAuth registration, never an account grant."""
import json
import os
from pathlib import Path
import re
import sys


def registration(data):
    client = data.get('installed', {})
    if not isinstance(client, dict) or not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', client.get('client_id', '')):
        raise ValueError('A Google OAuth Desktop client registration is required.')
    if not isinstance(client.get('client_secret'), str) or not client['client_secret']:
        raise ValueError('The Google OAuth Desktop registration is incomplete.')
    # Only registration fields may enter the app. Never bundle refresh/access tokens.
    return {'installed': {
        'client_id': client['client_id'], 'client_secret': client['client_secret'],
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
        'token_uri': 'https://oauth2.googleapis.com/token',
        'redirect_uris': ['http://localhost'],
    }}


def stage(contents, root, required=False):
    # Development and production ship the same Google Desktop OAuth client, so the
    # local registration file is an accepted source for a release build too, not
    # only for dev-mac.mjs. `required` only means a registration must end up
    # bundled, not that it must arrive through the environment variable.
    contents, root = Path(contents), Path(root)
    source = os.environ.get('WORLDLET_GOOGLE_CLIENT_FILE')
    local = root / '.local/google-oauth-client.json'
    if not source and local.exists():
        source = str(local)
    target = contents / 'Resources/GoogleOAuthClient.json'
    if not source:
        if required:
            raise ValueError('Set WORLDLET_GOOGLE_CLIENT_FILE, or place the registration at .local/google-oauth-client.json, before releasing. Account tokens must not be bundled.')
        target.unlink(missing_ok=True)
        return False
    path = Path(source)
    if path.stat().st_size > 64_000:
        raise ValueError('The Google OAuth registration is too large.')
    result = registration(json.loads(path.read_text()))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result))
    # App identity, not an account secret: every macOS user of the installed app must read it.
    target.chmod(0o644)
    return True


if __name__ == '__main__':
    try:
        configured = stage(sys.argv[1], Path(__file__).resolve().parent.parent, '--required' in sys.argv)
        print('Google Desktop OAuth registration staged.' if configured else 'Development build has no Google OAuth registration.')
    except (ValueError, OSError) as exc:
        raise SystemExit('Google OAuth packaging failed: ' + str(exc)) from None
