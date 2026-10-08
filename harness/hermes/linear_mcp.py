"""Bounded reads of the person's own issues through Linear's official MCP server; no writes."""
import re
from mcp_session import connected_session, mcp_payload

ENDPOINT = 'https://mcp.linear.app/mcp'
READ_TOOLS = ['list_issues', 'get_issue']
PAGE = 20


def payload(result):
    return mcp_payload(result, 'Linear could not read these issues. Reconnect or open the website.', 'Linear returned an unsupported response.', (dict, list))


def identifier(value):
    # A Linear issue is addressed by its UUID or its team key and number (ENG-123).
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value):
        raise ValueError('Invalid Linear issue ID.')
    return value


def name(value):
    """Linear MCP returns related records either as their name or as an object carrying one."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ('name', 'displayName', 'label', 'title'):
            if isinstance(value.get(key), str):
                return value[key]
    return None


def issue(row):
    if not isinstance(row, dict) or not isinstance(row.get('title'), str):
        raise ValueError('Linear returned an invalid issue.')
    key = identifier(row.get('identifier') or row.get('id'))
    description = row.get('description') or ''
    if not isinstance(description, str):
        raise ValueError('Linear returned an invalid issue description.')
    details = {}
    for field, source in (('status', 'status'), ('status', 'state'), ('priority', 'priority'), ('project', 'project'),
                          ('team', 'team'), ('assignee', 'assignee'), ('cycle', 'cycle')):
        if field not in details and name(row.get(source)):
            details[field] = name(row[source])
    if field_value := row.get('priorityLabel'):
        details['priority'] = str(field_value)
    for field in ('dueDate', 'updatedAt', 'createdAt'):
        if isinstance(row.get(field), str):
            details[field] = row[field]
    labels = row.get('labels')
    if isinstance(labels, dict):
        labels = labels.get('nodes')
    if isinstance(labels, list):
        names = [n for n in (name(label) for label in labels) if n]
        if names:
            details['labels'] = ', '.join(names[:8])
    url = row.get('url')
    if not isinstance(url, str) or not url.startswith('https://linear.app/'):
        url = 'https://linear.app/'
    return {'id': key, 'title': row['title'], 'description': description, 'url': url, 'details': details,
            'list': ' · '.join(details[k] for k in ('status', 'priority', 'dueDate') if details.get(k))}


def rows_and_cursor(value):
    rows, cursor, more = None, None, False
    if isinstance(value, list):
        rows = value
    elif isinstance(value, dict):
        rows = next((value[k] for k in ('issues', 'nodes', 'results', 'data') if isinstance(value.get(k), list)), None)
        info = value.get('pageInfo') if isinstance(value.get('pageInfo'), dict) else value
        cursor = next((info[k] for k in ('endCursor', 'nextCursor', 'cursor') if isinstance(info.get(k), str) and info[k]), None)
        more = info.get('hasNextPage', info.get('hasMore', cursor is not None)) is True
    if not isinstance(rows, list):
        raise RuntimeError('Linear did not return an issue list.')
    if more and (not cursor or len(cursor) > 4096):
        raise RuntimeError('Linear did not return a usable next page.')
    return rows, cursor if more else None


def list_arguments(schema, cursor):
    """Fit the request to the tool's advertised arguments: the person's own open issues, newest first."""
    props = (schema or {}).get('properties') or {}
    args = {}
    for key in ('assignee', 'assigneeId'):
        if key in props:
            args[key] = 'me'
            break
    if 'limit' in props:
        args['limit'] = PAGE
    if 'orderBy' in props:
        args['orderBy'] = 'updatedAt'
    if 'includeArchived' in props:
        args['includeArchived'] = False
    if cursor:
        key = next((k for k in ('cursor', 'after') if k in props), None)
        if key is None:
            raise RuntimeError('This Linear server cannot page further. Open the website for older issues.')
        args[key] = cursor
    return args


async def read_session(session, body):
    operation = body.get('operation', 'list')
    if operation == 'list':
        cursor = body.get('cursor')
        if cursor is not None and (not isinstance(cursor, str) or len(cursor) > 4096):
            raise ValueError('Invalid issue cursor.')
        tools = await session.list_tools()
        schema = next((getattr(t, 'inputSchema', None) for t in getattr(tools, 'tools', []) if getattr(t, 'name', '') == 'list_issues'), None)
        value = payload(await session.call_tool('list_issues', list_arguments(schema, cursor), read_timeout_seconds=45))
        rows, next_cursor = rows_and_cursor(value)
        return {'pages': [issue(row) for row in rows[:100]], 'next': next_cursor, 'connected': True,
                'scope': 'Your issues · Newest first · Read only'}
    if operation == 'read':
        key = identifier(body.get('id'))
        value = payload(await session.call_tool('get_issue', {'id': key}, read_timeout_seconds=45))
        result = issue(value.get('issue') if isinstance(value, dict) and isinstance(value.get('issue'), dict) else value)
        if result['id'] != key:
            raise RuntimeError('Linear returned a different issue. Reopen the list.')
        # Details render separately in Worldlet. No provider HTML.
        result['text'] = result['description']
        return result
    raise ValueError('Unsupported read-only Linear operation.')


def read(body):
    session, run = connected_session('linear', (ENDPOINT,), 'Connect Linear with Fox first.',
                                     'Reconnect to the official Linear MCP.', 'Linear is disconnected. Reconnect with Fox.', READ_TOOLS, bearer=True)
    return run(lambda: read_session(session, body), timeout=60)
