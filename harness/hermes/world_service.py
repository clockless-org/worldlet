"""Model-independent World services. No model, agent, or chat session is invoked."""
import json
import os
from pathlib import Path
from jsonschema import validate
from world_contract import schema

def execute(name, args, *, native, home, cancelled, google, lock, authorize=True, source_analysis=False):
    definition = schema(name)
    if source_analysis and name == 'upsert_world_items':
        from attention_policy import source_candidate_schema
        definition = source_candidate_schema(definition)
    validate(args, definition['parameters'])
    if cancelled.is_set():
        raise RuntimeError('Task stopped.')
    # The host's shared turn-trust rule decides routine (#404) and DoorDash cart (#672) writes by operation.
    detail = {'provider':args['service']} if name == 'read_connected_google' else {'action':args['action']} if name == 'manage_routines' else {'operation':args.get('operation','status')} if name == 'use_doordash' else {}
    permission = json.loads(native('_world_authorize', {'name':name, **detail})) if authorize else {'ok':True}
    if permission.get('error') or not permission.get('ok'):
        raise RuntimeError(permission.get('error', 'World service permission required.'))
    if name == 'read_world_source':
        from source_reader import execute as read
        return json.loads(read(args, native, Path(os.environ.get('WORLDLET_SOURCE_HOME', str(home))), cancelled))
    if name == 'prepare_email':
        draft = google({'operation':'prepare_email','draft':args})
        return json.loads(native('_email_review', draft))
    if name == 'read_connected_google':
        with lock('worldlet.sources.lock'):
            return google({'operation':'read','service':args['service']})
    if name == 'manage_routines':
        import routines
        return routines.manage(args)
    if name == 'use_doordash':
        import doordash_cli
        if not doordash_cli.enabled(home):
            return {'error':'Connect DoorDash in its Applet first.'}
        with lock('worldlet.doordash.lock'):
            return doordash_cli.run(args, home)
    return json.loads(native(name, args))
