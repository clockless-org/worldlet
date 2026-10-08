"""Bounded reads and private reviewed completion IO for Doist's official MCP server."""
import re
from mcp_session import connected_session, mcp_payload

ENDPOINT = 'https://ai.todoist.net/mcp'
READ_TOOLS = ['find-tasks', 'fetch-object']


def payload(result):
    return mcp_payload(result, 'Todoist could not read these tasks. Reconnect or open the website.', 'Todoist returned an unsupported response.', dict)


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9]{1,100}', value):
        raise ValueError('Invalid Todoist task ID.')
    return value


def task(row):
    if not isinstance(row, dict):
        raise ValueError('Invalid Todoist task.')
    key = identifier(row.get('id'))
    if not isinstance(row.get('content'), str) or not isinstance(row.get('description', ''), str):
        raise ValueError('Todoist returned an invalid title or description.')
    detail = {k: row.get(k) for k in ['dueDate', 'deadlineDate', 'priority', 'projectId', 'labels', 'recurring', 'checked', 'parentId', 'responsibleUid', 'duration'] if row.get(k) is not None}
    # Preserve the full text rather than silently replacing an original with a truncated summary.
    return {'id': key, 'title': row['content'], 'description': row.get('description', ''),
            'url': 'https://app.todoist.com/app/task/' + key, 'details': detail,
            'list': ' · '.join(str(detail[k]) for k in ['priority', 'dueDate'] if detail.get(k))}


async def read_session(session, body):
    operation = body.get('operation', 'list')
    if operation == 'list':
        cursor = body.get('cursor')
        if cursor is not None and (not isinstance(cursor, str) or len(cursor) > 4096):
            raise ValueError('Invalid task cursor.')
        args = {'filter': 'all', 'limit': 20, 'responsibleUserFiltering': 'all'}
        if cursor:
            args['cursor'] = cursor
        data = payload(await session.call_tool('find-tasks', args, read_timeout_seconds=45))
        rows = data.get('tasks')
        if not isinstance(rows, list):
            raise RuntimeError('Todoist did not return a task list.')
        more, next_cursor = data.get('hasMore', False), data.get('nextCursor')
        if more and (not isinstance(next_cursor, str) or not next_cursor or len(next_cursor) > 4096):
            raise RuntimeError('Todoist did not return a usable next page.')
        return {'pages': [task(row) for row in rows], 'next': next_cursor if more else None,
                'scope': 'Active tasks · 20 per page · Read only', 'connected': True}
    if operation == 'read':
        key = identifier(body.get('id'))
        data = payload(await session.call_tool('fetch-object', {'type': 'task', 'id': key}, read_timeout_seconds=45))
        result = task(data.get('object'))
        if result['id'] != key:
            raise RuntimeError('Todoist returned a different task. Reopen the list.')
        # Details rendered separately in Worldlet. No arbitrary provider HTML.
        result['text'] = result['description']
        return result
    raise ValueError('Unsupported read-only Todoist operation.')


async def reviewed_session(session, body):
    """Private host IO after the shared review. Never registered as a chat tool."""
    operation = body.get('operation')
    if operation not in ('review', 'complete'):
        raise ValueError('Unsupported reviewed Todoist operation.')
    key = identifier(body.get('id'))
    if operation == 'review':
        return payload(await session.call_tool('fetch-object', {'type': 'task', 'id': key, 'includeChildren': True}, read_timeout_seconds=45))
    receipt = payload(await session.call_tool('complete-tasks', {'ids': [key]}, read_timeout_seconds=45))
    # No retry: an error after submission is an uncertain result, not permission to replay.
    observed = payload(await session.call_tool('fetch-object', {'type': 'task', 'id': key}, read_timeout_seconds=45))
    return {'receipt': receipt, 'observed': observed}


def read(body):
    session, run = connected_session('todoist', (ENDPOINT,), 'Connect Todoist with Fox first.',
                                     'Reconnect to the official Todoist MCP.', 'Todoist is disconnected. Reconnect with Fox.', READ_TOOLS)
    runner = reviewed_session if body.get('operation') in ('review', 'complete') else read_session
    return run(lambda: runner(session, body), timeout=100 if body.get('operation') == 'complete' else 60)
