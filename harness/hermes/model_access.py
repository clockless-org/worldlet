"""Native onboarding adapter for pinned Hermes provider auth, never a model tool."""
import json
import os
import re
from pathlib import Path



def catalog():
    """Expose Hermes' canonical provider catalog without reclassifying it.

    Worldlet is only a presentation bridge: provider id, authentication type,
    credential environment variable and endpoint remain Hermes' contract.
    Unsupported account flows are described honestly rather than recast as an
    OpenAI-compatible API-key form.
    """
    from hermes_cli.provider_catalog import provider_catalog
    from hermes_cli.auth import PROVIDER_REGISTRY
    choices = []
    for item in provider_catalog():
        if item.auth_type == 'virtual':
            continue
        profile = PROVIDER_REGISTRY.get(item.slug)
        choices.append({
            'id': item.slug, 'name': item.label, 'description': item.description,
            'provider': item.slug, 'auth': item.auth_type,
            'baseURL': (profile.inference_base_url if profile else ''),
            'keyEnv': item.api_key_env_vars[0] if item.api_key_env_vars else '',
            'local': item.slug in {'lmstudio'}, 'keyless': item.keyless,
            'model': 'deepseek-v4-flash' if item.slug == 'opencode-go' else '',
            # Codex is the one account flow currently transported through the
            # native bridge. Every other non-key setup must stay in Hermes'
            # own command until its auth callback is implemented here.
            'nativeSetup': item.slug == 'openai-codex' or item.auth_type == 'api_key' or item.keyless,
        })
    choices.append({'id':'custom','name':'Another compatible provider','description':'A compatible endpoint you manage.',
                    'provider':'custom','baseURL':'','model':'','auth':'api_key','keyEnv':'OPENAI_API_KEY','nativeSetup':True})
    return {'providers': choices}


def configure_provider(body):
    """Save an API-key provider through Hermes' own registry/config helpers."""
    if os.environ.get('WORLDLET_MODEL_HOME'):
        raise ValueError('Open model setup in your own world.')
    provider_id = str(body.get('provider', '')).strip().lower()
    if not provider_id and str(body.get('baseURL', '')).strip():
        provider_id = 'custom'
    key = str(body.get('apiKey', ''))
    model = str(body.get('model', '')).strip()
    if len(key) > 8192 or '\n' in key or '\r' in key:
        raise ValueError('Enter a single API key.')
    if not model or len(model) > 200:
        raise ValueError('Enter a model ID.')
    from hermes_cli.auth import PROVIDER_REGISTRY, _update_config_for_provider
    from hermes_cli.config import load_config, save_config, save_env_value
    if provider_id == 'custom':
        from urllib.parse import urlparse
        base_url = str(body.get('baseURL', '')).strip().rstrip('/')
        parsed = urlparse(base_url)
        if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in {'127.0.0.1','localhost','::1'}):
            raise ValueError('Use an HTTPS model endpoint or a local HTTP endpoint.')
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('The endpoint must not contain credentials or query parameters.')
        save_env_value('OPENAI_API_KEY', key)
        cfg = load_config()
        cfg['model'] = {'provider':'custom','default':model,'base_url':base_url,'api_key':'${OPENAI_API_KEY}'}
        save_config(cfg)
        return {'ok':True,'provider':'custom','model':model}
    provider = PROVIDER_REGISTRY.get(provider_id)
    if not provider or provider.auth_type != 'api_key':
        raise ValueError('This Hermes provider needs its own account setup.')
    if provider.api_key_env_vars and not key:
        raise ValueError('Enter the API key for this provider.')
    if provider.api_key_env_vars:
        save_env_value(provider.api_key_env_vars[0], key)
    _update_config_for_provider(provider_id, provider.inference_base_url, model)
    cfg = load_config(); cfg.setdefault('model', {})['default'] = model; save_config(cfg)
    return {'ok':True,'provider':provider_id,'model':model}


def bind_model_auth(model_home):
    if os.environ.get("WORLDLET_EXTERNAL_AGENT") == "1":
        return
    from hermes_cli import auth_codex
    # A revoked Worldlet grant must prompt reauthentication, never silently
    # adopt another application's rotating refresh token.
    auth_codex._recover_codex_tokens_from_cli = lambda reason: None
    # Reuse Hermes' profile fallback + source-aware refresh locks. Never clone a
    # rotating OAuth grant or expose the private conversation/memory directories.
    if model_home:
        from hermes_cli import auth
        auth._global_auth_file_path = lambda: Path(model_home) / 'auth.json'
    bind_local_codex()


def bind_local_codex():
    """Borrow this computer's Codex sign-in, read-only: the host's model source in every build when the person has no
    provider of their own (Worldlet provides no model, owner decision 2026-10-05).

    Codex refresh tokens are single-use, so Worldlet never refreshes, stores or
    rotates them; the Codex app keeps owning its session. Each request rereads the
    current access token, which the Codex app renews on its own schedule.
    """
    from model_tiers import active_source
    if active_source() != 'local-codex':
        return
    from hermes_cli import auth, auth_codex, runtime_provider
    from hermes_cli.auth_constants import AuthError

    def access_token():
        path = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex') / 'auth.json'
        try:
            token = (json.loads(path.read_text(encoding='utf-8-sig')).get('tokens') or {}).get('access_token')
        except (OSError, ValueError, AttributeError):
            token = None
        if not isinstance(token, str) or not token.strip():
            # Worldlet provides no model (owner decision 2026-10-05): without this sign-in or the person's own key, Fox has none.
            raise AuthError('Fox runs on an AI on this computer. Sign in to Codex on this computer, or add your own API key.',
                            provider='openai-codex', code='codex_local_missing', relogin_required=False)
        if auth._codex_access_token_is_expiring(token, 0):
            raise AuthError('The Codex sign-in on this computer has expired. Open Codex to renew it, then retry.',
                            provider='openai-codex', code='codex_local_expired', relogin_required=False)
        return token.strip()

    def read(*, _lock=True):
        return {'tokens': {'access_token': access_token()}, 'last_refresh': None}

    def resolve(**_):
        return auth_codex._codex_runtime_result(access_token(), source='codex-cli', last_refresh=None)

    def refuse(*_, **__):
        raise AuthError('Worldlet development never refreshes or replaces the Codex sign-in on this computer.',
                        provider='openai-codex', code='codex_local_readonly', relogin_required=False)

    for module in (auth, auth_codex):
        module._read_codex_tokens = read
        module.resolve_codex_runtime_credentials = resolve
        module.refresh_codex_oauth_pure = refuse
        module._save_codex_tokens = refuse
    runtime_provider.resolve_codex_runtime_credentials = resolve


def credential_ready(model, home):
    from dotenv import dotenv_values
    home = Path(home)
    if model.get('provider') == 'openai-codex':
        from hermes_cli.auth import _read_codex_tokens
        try:
            _read_codex_tokens()
            return True
        except Exception:
            return False
    from model_tiers import included_endpoint
    if included_endpoint(model.get('base_url', '')):
        return bool(os.environ.get('WORLDLET_INCLUDED_TOKEN'))
    provider = str(model.get('provider') or '').strip()
    env = dotenv_values(home / '.env')
    if provider and provider != 'custom':
        from hermes_cli.auth import PROVIDER_REGISTRY, get_auth_status
        profile = PROVIDER_REGISTRY.get(provider)
        if profile and profile.api_key_env_vars and any(env.get(name) for name in profile.api_key_env_vars):
            return True
        return bool(get_auth_status(provider).get('logged_in'))
    from urllib.parse import urlparse
    url = urlparse(model.get('base_url', ''))
    return bool(env.get('OPENAI_API_KEY')) or (url.scheme == 'http' and url.hostname in {'localhost','127.0.0.1','::1'})


def select_codex_model(access_token, current=''):
    """Account catalog only: Hermes' generic picker adds speculative model slugs."""
    import httpx
    from hermes_cli.codex_models import _extract_chatgpt_account_id, _ranked_slugs
    from agent.model_metadata import CODEX_MODELS_CATALOG_URL
    headers = {'Authorization': 'Bearer ' + access_token}
    account = _extract_chatgpt_account_id(access_token)
    if account:
        headers['ChatGPT-Account-Id'] = account
    try:
        response = httpx.get(CODEX_MODELS_CATALOG_URL, headers=headers, timeout=15)
        response.raise_for_status()
        models = _ranked_slugs(response.json().get('models', []))
    except Exception:
        raise RuntimeError('Could not check the models available to your ChatGPT account. Please try again.') from None
    if not models:
        raise RuntimeError('Your ChatGPT account returned no available Codex models. Your previous model is unchanged.')
    return current if current in models else models[0]


def repair_codex():
    from hermes_cli.config import load_config, save_config
    from hermes_cli.auth_codex import resolve_codex_runtime_credentials
    if os.environ.get('WORLDLET_MODEL_HOME'):
        raise ValueError('Open model setup in your own world.')
    cfg = load_config()
    model = cfg.get('model') or {}
    if model.get('provider') != 'openai-codex':
        raise ValueError('This connection is not using Codex.')
    credentials = resolve_codex_runtime_credentials()
    selected = select_codex_model(credentials['api_key'], model.get('default', ''))
    model['default'] = selected
    save_config(cfg)
    return {'ok':True, 'model':selected}


def login(body, emit, cancelled):
    if body.get('provider') != 'openai-codex' or os.environ.get('WORLDLET_MODEL_HOME'):
        raise ValueError('Open model setup in your own world to connect Codex.')
    from hermes_cli import auth_codex as codex
    from hermes_cli.auth_constants import CODEX_OAUTH_CLIENT_ID, DEFAULT_CODEX_BASE_URL
    from hermes_cli.auth import _save_codex_tokens
    from hermes_cli.config import load_config, save_config
    issuer = 'https://auth.openai.com'
    device = codex._codex_request_device_code(issuer, CODEX_OAUTH_CLIENT_ID)
    if cancelled.is_set():
        raise RuntimeError('Sign-in cancelled.')
    emit('model_auth', url=issuer + '/codex/device', code=device['user_code'])
    result = codex._codex_poll_authorization_code(issuer, device_auth_id=device['device_auth_id'],
                                                user_code=device['user_code'], poll_interval=device['interval'])
    if cancelled.is_set():
        raise RuntimeError('Sign-in cancelled.')
    tokens = codex._codex_exchange_authorization_code(issuer, CODEX_OAUTH_CLIENT_ID, result)
    if cancelled.is_set():
        raise RuntimeError('Sign-in cancelled.')
    if not tokens.get('access_token') or not tokens.get('refresh_token'):
        raise RuntimeError('Sign-in did not return a complete credential. Please try again.')
    selected = select_codex_model(tokens['access_token'])
    if cancelled.is_set():
        raise RuntimeError('Sign-in cancelled.')
    _save_codex_tokens({'access_token':tokens['access_token'],'refresh_token':tokens['refresh_token']})
    cfg = load_config()
    cfg['model'] = {'provider':'openai-codex','default':selected,'base_url':DEFAULT_CODEX_BASE_URL}
    save_config(cfg)
    return {'ok':True,'provider':'openai-codex','model':cfg['model']['default']}


# A person's own Hermes Agent or OpenClaw (owner decision 2026-10-02: copy, not share). Only an
# API-key model setting is copied: a sign-in that renews itself (OAuth) is never cloned, because two
# copies renewing the same grant sign each other out. The source files are only read.
_ENV_REF = re.compile(r'^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$')
_MAX_FILE = 1_000_000


def _read_text(path):
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > _MAX_FILE:
            return ''
        return path.read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError):
        return ''


def _env_file(path):
    values = {}
    for line in _read_text(path).splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        if key.strip():
            values[key.strip()] = value
    return values


def _resolve(value, env):
    """A literal key, or a ${NAME} reference to the source's own environment file."""
    if not isinstance(value, str) or not value.strip():
        return ''
    match = _ENV_REF.match(value.strip())
    return env.get(match.group(1), '') if match else value.strip()


def own_model_setting(kind, home, key_names=lambda provider: []):
    """The API-key model setting of a person's own Agent: {provider, model, baseURL, apiKey}, or
    {reason} when there is none to copy. `key_names(provider)` lists a provider's key variables."""
    home = Path(home)
    if kind == 'hermes':
        import yaml
        try:
            config = yaml.safe_load(_read_text(home / 'config.yaml')) or {}
        except yaml.YAMLError:
            return {'reason': 'unreadable'}
        model = config.get('model') if isinstance(config, dict) else None
        if isinstance(model, str):
            model = {'default': model}
        if not isinstance(model, dict) or not str(model.get('default') or '').strip():
            return {'reason': 'none'}
        env = _env_file(home / '.env')
        provider = str(model.get('provider') or 'auto').strip().lower()
        base_url = str(model.get('base_url') or '').strip()
        key = _resolve(model.get('api_key'), env)
        if provider in ('', 'auto', 'custom') and base_url:
            provider = 'custom'
            key = key or env.get('OPENAI_API_KEY', '')
        if not key:
            key = next((env[name] for name in key_names(provider) if env.get(name)), '')
        if not key:
            return {'reason': 'sign-in', 'provider': provider}
        return {'provider': provider, 'model': str(model['default']).strip(), 'baseURL': base_url, 'apiKey': key}
    if kind == 'openclaw':
        try:
            config = json.loads(_read_text(home / 'openclaw.json') or '{}')
        except ValueError:
            # JSON5 (comments, trailing commas) is OpenClaw's own; plain JSON only here.
            return {'reason': 'unreadable'}
        env = _env_file(home / '.env')
        env.update({k: v for k, v in (config.get('env') or {}).items() if isinstance(v, str)} if isinstance(config.get('env'), dict) else {})
        primary = (((config.get('agents') or {}).get('defaults') or {}).get('model') or {})
        primary = primary.get('primary') if isinstance(primary, dict) else primary
        if not isinstance(primary, str) or '/' not in primary:
            return {'reason': 'none'}
        provider, model = primary.split('/', 1)
        provider = provider.strip().lower()
        custom = (((config.get('models') or {}).get('providers') or {}).get(provider) or {})
        key = _resolve(custom.get('apiKey'), env) if isinstance(custom, dict) else ''
        base_url = str(custom.get('baseUrl') or '').strip() if isinstance(custom, dict) else ''
        if not key:
            try:
                profiles = json.loads(_read_text(home / 'agents' / 'main' / 'agent' / 'auth-profiles.json') or '{}').get('profiles') or {}
            except (ValueError, AttributeError):
                profiles = {}
            for profile in profiles.values() if isinstance(profiles, dict) else []:
                if isinstance(profile, dict) and profile.get('provider') == provider and profile.get('type') in ('api_key', 'token'):
                    key = _resolve(profile.get('key') or profile.get('apiKey') or profile.get('token'), env)
                    if key:
                        break
        if not key:
            key = next((env[name] for name in key_names(provider) if env.get(name)), '')
        if not key:
            return {'reason': 'sign-in', 'provider': provider}
        return {'provider': 'custom' if base_url else provider, 'model': model.strip(), 'baseURL': base_url, 'apiKey': key}
    if kind == 'pi':
        try:
            settings = json.loads(_read_text(home / 'settings.json') or '{}')
            auth = json.loads(_read_text(home / 'auth.json') or '{}')
        except ValueError:
            return {'reason': 'unreadable'}
        provider = str(settings.get('defaultProvider') or '').strip().lower() if isinstance(settings, dict) else ''
        model = str(settings.get('defaultModel') or '').strip() if isinstance(settings, dict) else ''
        if not provider or not model:
            return {'reason': 'none'}
        # pi's provider ids are mostly Hermes's own; these two are named differently there.
        hermes_provider = {'openai': 'openai-api', 'google': 'gemini'}.get(provider, provider)
        entry = auth.get(provider) if isinstance(auth, dict) else None
        key = entry.get('key') if isinstance(entry, dict) and entry.get('type') == 'api_key' else ''
        if not isinstance(key, str) or not key.strip():
            return {'reason': 'sign-in', 'provider': hermes_provider}
        return {'provider': hermes_provider, 'model': model, 'baseURL': '', 'apiKey': key.strip()}
    raise ValueError('Choose Hermes Agent, OpenClaw or pi.')


def adopt_model(body):
    """Saves the person's own Agent's API-key model as Fox's model. Never returns the key."""
    if os.environ.get('WORLDLET_MODEL_HOME'):
        raise ValueError('Open model setup in your own world.')
    home = str(body.get('home', ''))
    if not os.path.isabs(home) or not os.path.isdir(home):
        return {'ok': False, 'reason': 'none'}
    from hermes_cli.auth import PROVIDER_REGISTRY
    def key_names(provider):
        profile = PROVIDER_REGISTRY.get(provider)
        return list(profile.api_key_env_vars or []) if profile else []
    found = own_model_setting(body.get('kind'), home, key_names)
    if 'reason' in found:
        return {'ok': False, 'reason': found['reason']}
    provider = found['provider']
    if provider != 'custom':
        profile = PROVIDER_REGISTRY.get(provider)
        if not profile or profile.auth_type != 'api_key':
            return {'ok': False, 'reason': 'sign-in'}
    try:
        configure_provider(found)
    except ValueError as error:
        return {'ok': False, 'reason': 'unsupported', 'message': str(error)}
    return {'ok': True, 'provider': provider, 'model': found['model']}
