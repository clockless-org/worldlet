"""Offline boundary test; does not claim real Hermes cron/model acceptance."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'harness/hermes'))
import routines
import turn_trust

assert routines.toolsets() == ['web', 'memory', 'skills', 'worldlet-readonly', 'no_mcp']
assert not any(t.startswith('mcp-') for t in routines.toolsets())
job = {'id': 'fixture', 'origin': {'platform': 'worldlet'}, 'deliver': 'local',
       'enabled_toolsets': ['terminal', 'mcp-write-service']}
executed, filters, registered, reads, paused, triggered, stored = [], [], [], [], [], [], []
jobs = types.SimpleNamespace(get_due_jobs=lambda: [dict(job)],
    claim_job_for_fire=lambda *a, **k: dict(job), get_job=lambda _: dict(job),
    pause_job=lambda *a, **k: paused.append((a, k)),
    load_jobs=lambda: stored, ONESHOT_GRACE_SECONDS=120, trigger_job=triggered.append,
    is_job_runnable=lambda j: j.get('enabled', True), is_terminal_job=lambda j: j.get('state') == 'completed')
NOW = datetime(2026, 10, 4, 9, 30, tzinfo=timezone.utc)
modules = {
    'cron': types.SimpleNamespace(jobs=jobs),
    'hermes_time': types.SimpleNamespace(now=lambda: NOW),
    'cron.scheduler': types.SimpleNamespace(run_one_job=lambda claimed, **k: executed.append((claimed, dict(turn_trust.GUARD.scopes)))),
    'tools.registry': types.SimpleNamespace(registry=types.SimpleNamespace(register=lambda **k: registered.append(k), dispatch=lambda *a, **k: '{}')),
    'tools.memory_tool': types.SimpleNamespace(memory_tool=lambda **k: '{}'),
    'run_agent': types.SimpleNamespace(AIAgent=type('AIAgent', (), {'_spawn_background_review': lambda *a, **k: None})),
    'hermes_cli.mcp_startup': types.SimpleNamespace(set_mcp_server_filter=lambda values: filters.append(values)),
}
# Deliberately do not install MCP discovery/config modules: a routine must not
# discover or connect a user's arbitrary foreground servers.
with tempfile.TemporaryDirectory(prefix='worldlet-routine-permissions-') as tmp:
    with patch.dict(os.environ, {'HERMES_HOME': tmp}), patch.dict(sys.modules, modules):
        cancelled = threading.Event(); cancelled.set()
        assert routines.tick(cancelled, lambda _: {}) == {'ran': False}
        assert not executed
        assert routines.tick(threading.Event(), lambda _: {})['ran']
        assert executed[-1][0]['enabled_toolsets'] == routines.toolsets()
        # Each run is its own untrusted-turn scope, closed afterwards (see turn-trust-check.py).
        assert executed[-1][1] == {'routine': None} and turn_trust.GUARD.scopes == {}
        assert filters[-1] == routines.toolsets()
        assert not registered, 'No Google reader without a grant file'
        Path(tmp, 'google_token.json').write_text('{}')
        def read_google(args):
            reads.append(args)
            return {'records': []}
        assert routines.tick(threading.Event(), read_google)['ran']
        reader = registered[-1]
        assert reader['name'] == 'read_connected_google'
        reader['handler']({'service': 'gmail'})
        assert reads == [{'operation': 'read', 'service': 'gmail'}]
        for unsupported in ['script', 'monitor_script', 'monitor_url', 'no_agent', 'skills', 'context_from', 'workdir']:
            job[unsupported] = 'external mode'
            count = len(executed)
            assert routines.tick(threading.Event(), read_google)['ran'] is False
            assert len(executed) == count and paused
            del job[unsupported]
        job['deliver'] = 'email'
        assert not routines.tick(threading.Event(), read_google)['ran']
        # A one-time routine missed while asleep: Hermes would retire it unrun past its grace, so the
        # tick re-arms it through Hermes' run-now first. Recurring, foreign, paused, claimed, already
        # run or within-grace one-shots are left to Hermes.
        ago = lambda s: (NOW - timedelta(seconds=s)).isoformat()
        once = lambda i, **k: {'id': i, 'origin': {'platform': 'worldlet'}, 'schedule': {'kind': 'once'}, 'next_run_at': ago(3 * 3600), **k}
        stored[:] = [once('remind'), once('soon', next_run_at=ago(60)), once('foreign', origin={'platform': 'telegram'}),
                     once('paused', enabled=False), once('claimed', run_claim={'at': ago(10)}), once('ran', last_run_at=ago(60)),
                     once('done', state='completed'), once('daily', schedule={'kind': 'cron'})]
        routines.tick(threading.Event(), read_google)
        assert triggered == ['remind'], triggered

# Brought copies whose Agent is now Fox's Harness wait for that Agent's own scheduler, and come back when it no
# longer is; a copy paused for another reason, Fox's own routines and other Agents' copies are left alone.
copy = lambda i, key, **k: {'id': i, 'origin': {'platform': 'worldlet', **({'imported': key} if key else {})}, 'enabled': True, **k}
kept = [copy('oc', 'openclaw:main:news'), copy('oc-paused', 'openclaw:main:x', enabled=False, paused_reason='Paused where it came from'),
        copy('hm', 'hermes:a1'), copy('own', None), copy('back', 'pi:x', enabled=False, paused_reason=routines.ELSEWHERE)]
moves = []
fake = types.SimpleNamespace(load_jobs=lambda: kept, is_job_runnable=lambda j: j.get('enabled', True),
    pause_job=lambda i, reason=None: moves.append(('pause', i, reason)), resume_job=lambda i: moves.append(('resume', i)))
routines.leave_elsewhere(fake, ['openclaw:', 'not-an-agent:'])
assert moves == [('pause', 'oc', routines.ELSEWHERE), ('resume', 'back')], moves
moves.clear(); kept[0].update(enabled=False, paused_reason=routines.ELSEWHERE)
routines.leave_elsewhere(fake, None)
assert moves == [('resume', 'oc'), ('resume', 'back')], moves

# #404: Hermes names the routine operation when authorizing, so the host's shared
# turn-trust rule can reject a create from an untrusted turn before anything is written.
managed, authorized = [], []
stubs = {'jsonschema': types.SimpleNamespace(validate=lambda *a: None),
         'world_contract': types.SimpleNamespace(schema=lambda name: {'parameters': {}}),
         'routines': types.SimpleNamespace(manage=lambda args: managed.append(args) or {'ok': True})}
with patch.dict(sys.modules, stubs):
    import world_service
    def native(name, body, denied=('create',)):
        authorized.append(body)
        return json.dumps({'error': 'Worldlet blocked this routine change.'} if body.get('action') in denied else {'ok': True})
    run = lambda args: world_service.execute('manage_routines', args, native=native, home=Path('.'), cancelled=threading.Event(), google=None, lock=None)
    try:
        run({'action': 'create', 'prompt': 'summarize my inbox', 'schedule': 'every 1h'})
        raise AssertionError('An unconfirmed create must be rejected')
    except RuntimeError as error:
        assert 'blocked this routine change' in str(error)
    assert authorized[-1] == {'name': 'manage_routines', 'action': 'create'} and not managed, 'Nothing is written'
    assert run({'action': 'pause', 'id': 'fixture'}) == {'ok': True} and managed[-1]['action'] == 'pause'
    # #672: a DoorDash cart change names its operation so the host refuses it after untrusted content.
    try:
        world_service.execute('use_doordash', {'operation': 'cart_add'}, native=lambda name, body: authorized.append(body) or json.dumps({'error': 'Worldlet blocked this write.'}), home=Path('.'), cancelled=threading.Event(), google=None, lock=None)
        raise AssertionError('A refused cart change must not reach DoorDash')
    except RuntimeError as error:
        assert 'blocked this write' in str(error)
    assert authorized[-1] == {'name': 'use_doordash', 'operation': 'cart_add'}
print('PASS routine boundary: no MCP inheritance, restored toolsets overridden, Google read-only dispatch, cancellation, unsupported-mode rejection, a per-run untrusted-turn scope, a one-time routine missed while asleep re-armed instead of dropped, brought copies left to their own Agent’s scheduler, and routine and DoorDash cart writes authorized by operation. Scheduler is mocked.')
