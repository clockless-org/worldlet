"""Official Supabase project metadata; no database contents, keys or mutations."""
import re
from mcp_session import connected_session, mcp_payload

ENDPOINT = 'https://mcp.supabase.com/mcp?read_only=true&features=account'
READ_TOOLS = ['list_projects', 'get_project']


def payload(result):
    return mcp_payload(result, 'Supabase could not read projects. Reconnect or use Web.', 'Supabase returned an unsupported response.', (dict, list))


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value):
        raise ValueError('Invalid Supabase project ID.')
    return value


def project(value):
    if not isinstance(value, dict) or not isinstance(value.get('name'), str):
        raise ValueError('Supabase returned an invalid project.')
    key = identifier(value.get('id'))
    ref = identifier(value.get('ref', key))
    # Deliberately project known public metadata fields, never keys/passwords.
    details = {k: value[k] for k in ['status', 'region', 'organization_id', 'organization_slug', 'created_at'] if isinstance(value.get(k), str)}
    return {'id': key, 'title': value['name'], 'description': '', 'text': '',
            'list': ' · '.join(details[k] for k in ['status', 'region'] if details.get(k)),
            'url': 'https://supabase.com/dashboard/project/' + ref, 'details': details}


async def read_session(session, body):
    op = body.get('operation')
    if op == 'list':
        if body.get('cursor'):
            raise ValueError('Supabase project listing does not use a cursor.')
        value = payload(await session.call_tool('list_projects', {}, read_timeout_seconds=45))
        rows = value.get('projects') if isinstance(value, dict) else value
        if not isinstance(rows, list):
            raise RuntimeError('Supabase did not return a project list.')
        if len(rows) > 500:
            raise RuntimeError('More than 500 projects are available. Use the dashboard to choose a project.')
        return {'pages': [project(row) for row in rows], 'next': None, 'connected': True,
                'scope': 'Projects · Status and region · Read only'}
    if op == 'read':
        key = identifier(body.get('id'))
        value = project(payload(await session.call_tool('get_project', {'id': key}, read_timeout_seconds=45)))
        if value['id'] != key:
            raise RuntimeError('Supabase returned a different project. Refresh the list.')
        return {**value, 'notice': 'Project metadata only. Database contents, logs and editing remain in Web.'}
    raise ValueError('Unsupported Supabase read operation.')


def read(body):
    session, run = connected_session('supabase', (ENDPOINT,), 'Connect Supabase with Fox first.',
                                     'Reconnect to the official read-only Supabase MCP.', 'Supabase is disconnected. Reconnect with Fox.', READ_TOOLS)
    return run(lambda: read_session(session, body), timeout=60)
