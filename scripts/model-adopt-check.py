"""A person's own Hermes Agent / OpenClaw / pi model: only an API-key setting is copied, never a sign-in."""
import json
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness' / 'hermes'))
from model_access import own_model_setting  # noqa: E402

KEYS = {'deepseek': ['DEEPSEEK_API_KEY'], 'anthropic': ['ANTHROPIC_API_KEY']}
names = lambda provider: KEYS.get(provider, [])
with tempfile.TemporaryDirectory() as scratch:
    hermes = Path(scratch, 'hermes'); hermes.mkdir()
    assert own_model_setting('hermes', hermes, names) == {'reason': 'none'}
    (hermes / 'config.yaml').write_text('model:\n  provider: deepseek\n  default: deepseek-chat\n')
    assert own_model_setting('hermes', hermes, names) == {'reason': 'sign-in', 'provider': 'deepseek'}, 'no key: nothing to copy'
    (hermes / '.env').write_text('# keys\nexport DEEPSEEK_API_KEY="sk-deep"\n')
    assert own_model_setting('hermes', hermes, names) == {'provider': 'deepseek', 'model': 'deepseek-chat', 'baseURL': '', 'apiKey': 'sk-deep'}
    (hermes / 'config.yaml').write_text('model:\n  provider: custom\n  default: qwen3\n  base_url: https://llm.example/v1\n  api_key: ${MY_KEY}\n')
    (hermes / '.env').write_text('MY_KEY=sk-mine\n')
    assert own_model_setting('hermes', hermes, names) == {'provider': 'custom', 'model': 'qwen3', 'baseURL': 'https://llm.example/v1', 'apiKey': 'sk-mine'}, 'a ${NAME} key resolves from its own .env'
    (hermes / 'config.yaml').write_text('model:\n  provider: openai-codex\n  default: gpt-5\n')
    (hermes / 'auth.json').write_text(json.dumps({'providers': {'openai-codex': {'tokens': {'refresh_token': 'r'}}}}))
    assert own_model_setting('hermes', hermes, names)['reason'] == 'sign-in', 'a sign-in (OAuth) is never copied'
    secret = Path(scratch, 'secret.env'); secret.write_text('DEEPSEEK_API_KEY=sk-outside\n')
    (hermes / 'config.yaml').write_text('model:\n  provider: deepseek\n  default: deepseek-chat\n')
    (hermes / '.env').unlink(); os.symlink(secret, hermes / '.env')
    assert own_model_setting('hermes', hermes, names)['reason'] == 'sign-in', 'a linked .env is not followed'

    claw = Path(scratch, 'openclaw'); claw.mkdir()
    assert own_model_setting('openclaw', claw, names) == {'reason': 'none'}
    (claw / 'openclaw.json').write_text('{ // json5\n agents: {} }')
    assert own_model_setting('openclaw', claw, names) == {'reason': 'unreadable'}
    (claw / 'openclaw.json').write_text(json.dumps({'agents': {'defaults': {'model': {'primary': 'anthropic/claude-sonnet-4-5'}}}}))
    profiles = claw / 'agents' / 'main' / 'agent'; profiles.mkdir(parents=True)
    (profiles / 'auth-profiles.json').write_text(json.dumps({'profiles': {'anthropic:default': {'type': 'api_key', 'provider': 'anthropic', 'key': 'sk-ant'}}}))
    assert own_model_setting('openclaw', claw, names) == {'provider': 'anthropic', 'model': 'claude-sonnet-4-5', 'baseURL': '', 'apiKey': 'sk-ant'}
    (profiles / 'auth-profiles.json').write_text(json.dumps({'profiles': {'anthropic:me': {'type': 'oauth', 'provider': 'anthropic', 'access': 'a'}}}))
    assert own_model_setting('openclaw', claw, names)['reason'] == 'sign-in', 'an OpenClaw OAuth profile is never copied'
    (claw / 'openclaw.json').write_text(json.dumps({'env': {'LOCAL_KEY': 'sk-local'}, 'agents': {'defaults': {'model': {'primary': 'local/llama'}}},
                                                     'models': {'providers': {'local': {'baseUrl': 'http://127.0.0.1:8080/v1', 'apiKey': '${LOCAL_KEY}'}}}}))
    assert own_model_setting('openclaw', claw, names) == {'provider': 'custom', 'model': 'llama', 'baseURL': 'http://127.0.0.1:8080/v1', 'apiKey': 'sk-local'}
    pi = Path(scratch, 'pi'); pi.mkdir()
    assert own_model_setting('pi', pi, names) == {'reason': 'none'}
    (pi / 'settings.json').write_text(json.dumps({'defaultProvider': 'openai', 'defaultModel': 'gpt-5'}))
    assert own_model_setting('pi', pi, names) == {'reason': 'sign-in', 'provider': 'openai-api'}
    (pi / 'auth.json').write_text(json.dumps({'openai': {'type': 'api_key', 'key': 'sk-pi'}}))
    assert own_model_setting('pi', pi, names) == {'provider': 'openai-api', 'model': 'gpt-5', 'baseURL': '', 'apiKey': 'sk-pi'}, 'pi openai maps to Hermes openai-api'
    (pi / 'settings.json').write_text(json.dumps({'defaultProvider': 'anthropic', 'defaultModel': 'claude-sonnet-4-5'}))
    (pi / 'auth.json').write_text(json.dumps({'anthropic': {'type': 'oauth', 'access': 'x'}}))
    assert own_model_setting('pi', pi, names)['reason'] == 'sign-in', 'a pi sign-in (OAuth) is never copied'
print('PASS own Agent model: API keys from Hermes Agent, OpenClaw and pi copied; sign-ins, links and JSON5 left behind')
