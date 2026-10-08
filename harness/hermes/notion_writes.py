"""Reviewed page writes. Only the native confirmation route calls commit.

Saved reviews are bound to the Hermes profile. A durable attempted marker is
written before MCP dispatch: a lost response never licenses another write.
"""
import hashlib
import json
import os
import re
import time
import tempfile
import uuid
from pathlib import Path
from jsonschema import validate, ValidationError
from notion_mcp import page_id, payload, page_result


def _folder(home):
    folder = Path(home) / 'worldlet-notion-reviews'
    folder.mkdir(mode=0o700, exist_ok=True)
    if folder.is_symlink():
        raise ValueError('Linked Notion reviews are not supported.')
    return folder


def _save(home, review):
    file = _folder(home) / (review['id'] + '.json')
    # A unique owner-only temp name: a file left by a crash never blocks later saves.
    fd, temp = tempfile.mkstemp(dir=file.parent, prefix='.review-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(review, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, file)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def _review_name(stem):
    try:
        return str(uuid.UUID(stem)) == stem
    except ValueError:
        return False


def _load(home, identifier):
    if str(uuid.UUID(identifier)) != identifier:
        raise ValueError('Invalid review.')
    file = _folder(home) / (identifier + '.json')
    if file.is_symlink() or file.stat().st_size > 300_000:
        raise ValueError('Invalid review file.')
    review = json.loads(file.read_text())
    if review.get('status') == 'review' and file.with_suffix('.attempt').exists():
        review['status'] = 'unconfirmed'
    return review


def public(review):
    return {key: review.get(key) for key in ('id', 'operation', 'target', 'targetTitle', 'title', 'markdown', 'status', 'url', 'createdAt')}


async def checked_args(session, name, candidates):
    listed = await session.list_tools()
    tool = next((tool for tool in listed.tools if tool.name == name), None)
    if tool is None:
        raise ValueError('Your Notion connection does not provide this write tool. Reconnect with page editing access.')
    schema = getattr(tool, 'inputSchema', None) or getattr(tool, 'input_schema', None)
    if not isinstance(schema, dict):
        raise ValueError('Notion write schema is unavailable.')
    for args in candidates:
        for candidate in (args, {'data': args}):
            try:
                validate(candidate, schema)
                return candidate
            except ValidationError:
                pass
    raise ValueError('This Notion write format is not supported yet. Nothing was submitted.')


def fingerprint(raw, target):
    # MCP prose may include a fresh fetch timestamp. Compare page data, not that wrapper.
    page = page_result(raw, target)
    value = {key: page.get(key) for key in ('id', 'title', 'markdown', 'partial', 'kind', 'lastEdited')}
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


async def prepare(session, body, home, binding):
    operation = body.get('operation')
    if operation not in ('create', 'append'):
        raise ValueError('Only create and append are supported.')
    target = page_id(body.get('target', ''))
    text, title = body.get('markdown'), body.get('title', '')
    if not isinstance(text, str) or not text.strip() or len(text.encode()) > 30_000 or not isinstance(title, str) or len(title) > 300:
        raise ValueError('Provide a bounded Markdown draft and title.')
    raw = payload(await session.call_tool('notion-fetch', {'id': target}, read_timeout_seconds=45))
    page = page_result(raw, target)
    if page['kind'] != 'page' or page['partial']:
        raise ValueError('Read a complete page before preparing a write. Databases and partial pages are not supported.')
    if operation == 'create':
        if not title.strip():
            raise ValueError('A new page needs a title.')
        name = 'notion-create-pages'
        candidates = [{'parent': {'page_id': target}, 'pages': [{'properties': {'title': title}, 'content': text}], 'allow_async': False}]
    else:
        name = 'notion-update-page'
        # Append only: never replace a page, apply a template or change properties.
        candidates = [{'page_id': target, 'command': 'insert_content', 'new_str': '\n\n' + text, 'allow_async': False}]
    args = await checked_args(session, name, candidates)
    if len(list(_folder(home).glob('*.json'))) >= 20:
        raise ValueError('Close existing Notion reviews before preparing another.')
    review = dict(id=str(uuid.uuid4()), operation=operation, target=target, targetTitle=page['title'], title=title, markdown=text,
                  binding=binding, priorCount=page['markdown'].count(text.strip()), url=page['url'], status='review', createdAt=time.time(), tool=name, args=args,
                  fingerprint=fingerprint(raw, target))
    _save(home, review)
    return public(review)


def result_state(value, review):
    task = value.get('async_task', value)
    if task.get('object') == 'async_task':
        review.update(status='pending', task=task.get('id'))
        return
    # A successful MCP transport alone is not evidence that the page was written.
    pages = value.get('pages') or value.get('results') or []
    if isinstance(pages, list) and pages and isinstance(pages[0], dict):
        try:
            review['url'] = 'https://www.notion.so/' + page_id(pages[0].get('url') or pages[0].get('id'))
            review['status'] = 'submitted'
            return
        except ValueError:
            pass
    review['status'] = 'unconfirmed'


async def handle(session, body, home):
    operation = body.get('operation')
    binding = body.get('binding')
    if not isinstance(binding, str) or not binding:
        raise ValueError('A connected Notion account is required.')
    if operation == 'prepare':
        return await prepare(session, body['draft'], home, binding)
    if operation == 'reviews':
        return {'reviews': [public(r) for p in _folder(home).glob('*.json') if _review_name(p.stem) and (r := _load(home, p.stem)).get('binding') == binding]}
    review = _load(home, body.get('id', ''))
    if review.get('binding') != binding:
        raise ValueError('This review belongs to a different Notion connection.')
    if operation == 'discard':
        (_folder(home) / (review['id'] + '.json')).unlink()
        return {'ok': True}
    if operation == 'commit':
        if review['status'] != 'review' or time.time() - review['createdAt'] > 3600:
            raise ValueError('This review was submitted or expired. Check Notion before preparing another.')
        raw = payload(await session.call_tool('notion-fetch', {'id': review['target']}, read_timeout_seconds=45))
        if fingerprint(raw, review['target']) != review['fingerprint']:
            raise ValueError('The destination changed. Review a fresh draft before writing.')
        # Revalidate against today's server schema before any mutation.
        args = await checked_args(session, review['tool'], [review['args']])
        marker = _folder(home) / (review['id'] + '.attempt')
        try:
            fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(fd)
        except FileExistsError:
            raise ValueError('This write was already attempted. Check its result instead.')
        review['status'] = 'unconfirmed'
        _save(home, review)
        try:
            value = payload(await session.call_tool(review['tool'], args, read_timeout_seconds=45))
            result_state(value, review)
            _save(home, review)
        except Exception:
            return public(review)
    elif operation == 'check':
        if review['status'] == 'review':
            return public(review)
        if review.get('task'):
            value = payload(await session.call_tool('notion-get-async-task', {'task_id': review['task']}, read_timeout_seconds=45))
            if value.get('status') == 'failed':
                review['status'] = 'failed'
            elif value.get('status') == 'succeeded':
                result_state(value.get('result', {}), review)
                review.pop('task', None)
            else:
                review['status'] = 'pending'
        if not review.get('task') and (review['operation'] == 'append' or review['url'] != 'https://www.notion.so/' + review['target']):
            raw = payload(await session.call_tool('notion-fetch', {'id': page_id(review['url'])}, read_timeout_seconds=45))
            # Bounded text verification, not a guarantee for arbitrary enhanced Markdown transformations.
            if page_result(raw, page_id(review['url']))['markdown'].count(review['markdown'].strip()) > (review.get('priorCount', 0) if review['operation'] == 'append' else 0):
                review['status'] = 'verified'
        _save(home, review)
    else:
        raise ValueError('Unsupported review action.')
    return public(review)
