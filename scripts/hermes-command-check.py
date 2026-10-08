"""The `hermes` command for Fox's profile borrows this computer's Codex sign-in read-only, as Fox does, and only
when the profile's model is that source; any other model runs the official command line untouched."""
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
import hermes_command

calls = []
config = {}
hermes_cli = types.ModuleType('hermes_cli')
hermes_cli.__path__ = []
config_module = types.ModuleType('hermes_cli.config')
config_module.load_config = lambda: config
main_module = types.ModuleType('hermes_cli.main')
main_module.main = lambda: calls.append(('main', os.environ.get('WORLDLET_MODEL_SOURCE'))) or 0
sys.modules.update({'hermes_cli': hermes_cli, 'hermes_cli.config': config_module, 'hermes_cli.main': main_module})
import model_access
model_access.bind_model_auth = lambda home: calls.append(('borrow', home))

config['model'] = {'provider': 'openai-codex', 'default': 'gpt-5', 'worldlet_source': 'local-codex'}
os.environ['WORLDLET_EXTERNAL_AGENT'] = '1'
assert hermes_command.main() == 0
assert calls == [('borrow', None), ('main', 'local-codex')], calls
assert 'WORLDLET_EXTERNAL_AGENT' not in os.environ

calls.clear()
del os.environ['WORLDLET_MODEL_SOURCE']
config['model'] = {'provider': 'openrouter', 'default': 'some/model'}
assert hermes_command.main() == 0
assert calls == [('main', None)], calls

calls.clear()
config['model'] = {'provider': 'openai-codex', 'default': 'gpt-5'}
hermes_command.main()
assert calls == [('main', None)], 'a Codex sign-in made in Hermes itself is its own'
# The resident gateway runs `python -m hermes_cli.main` without this file; Worldlet's hook borrows the same way, only
# when Hermes' home is Worldlet's own profile.
import tempfile
profile = Path(tempfile.mkdtemp())
(profile / 'linked').symlink_to(profile)
constants = types.ModuleType('hermes_constants')
home = {'path': profile / 'linked'}
constants.get_hermes_home = lambda: home['path']
sys.modules['hermes_constants'] = constants
calls.clear()
config['model'] = {'provider': 'openai-codex', 'default': 'gpt-5', 'worldlet_source': 'local-codex'}
hermes_command.borrow_codex_for(str(profile))
assert calls == [('borrow', None)], 'the gateway on Worldlet\'s profile (through the standard link) borrows read-only'
calls.clear()
home['path'] = profile / 'profiles' / 'other'
hermes_command.borrow_codex_for(str(profile))
assert calls == [], 'another profile on the same runtime keeps its own model'
print('PASS hermes command: borrows the Codex sign-in read-only only for the source Worldlet chose')
