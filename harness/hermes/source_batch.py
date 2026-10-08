"""Bounded background batch protocol, without a model-driven tool/history loop."""
import json
import re
from copy import deepcopy
from jsonschema import validate
from jsonschema.exceptions import ValidationError

# Core's ATTENTION_CONTENT_LIMITS.reasonWords (core/attention/attention-content.ts). The card
# schema states the word rule but JSON Schema cannot enforce it, so the Center batch checks it
# here and repairs it with the same model call. scripts/source-batch-check.py fails on drift.
ATTENTION_REASON_WORDS = 8
# JavaScript's \s (and String.prototype.trim) set, which Core splits on; Python's \s differs.
_JS_WHITESPACE = re.compile('[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+')


def attention_reason_words(reason):
    """Count words exactly as Core's attentionReasonWords: trim, then split on whitespace runs."""
    return max(1, sum(1 for word in _JS_WHITESPACE.split(reason) if word))


def indexed_source_evidence(snapshot, schema):
    """Batch models select exact host-owned spans instead of transcribing quotes."""
    snapshot, schema = deepcopy(snapshot), deepcopy(schema)
    sources = [schema['properties']['items']['items']['properties']['sources']['items']]
    review = schema['properties'].get('reviews', {}).get('items', {})
    if 'sources' in review.get('properties', {}):
        sources.append(review['properties']['sources']['items'])
    for source in sources:
        source['properties']['quoteRef'] = {'type': 'integer', 'minimum': 1}
        source['properties'].pop('quote', None)
        source['required'] = [k for k in source['required'] if k != 'quote'] + ['quoteRef']
    excerpts = {}
    for row in snapshot.get('context', []):
        text = row.pop('text', '')
        passages = row.pop('evidenceParts', None) or [text]
        parts = []
        # Never join disjoint extraction quotes into an invented source passage.
        for text in passages:
            while text:
                end = min(len(text), 800)
                if len(text) > end:
                    boundary = max(text.rfind('\n', 0, end), text.rfind(' ', 0, end))
                    if boundary >= 400:
                        end = boundary + 1
                parts.append(text[:end]); text = text[end:]
        owner = row['sourceReference']
        excerpts[(owner['provider'], owner['id'])] = parts
        row['evidence'] = [{'quoteRef': i + 1, 'text': part} for i, part in enumerate(parts)]
    return snapshot, schema, excerpts


def restore_entry_evidence(item, excerpts):
    for ref in item.get('sources', []):
        parts = excerpts.get((ref.get('provider'), ref.get('id')), [])
        index = ref.get('quoteRef')
        if type(index) is not int or not 1 <= index <= len(parts):
            raise ValueError('Use a quoteRef number from that exact sourceReference record.')
        ref['quote'] = parts[index - 1]
        del ref['quoteRef']


def context_references(snapshot):
    """Map each authorized sourceReference to the context IDs that supplied it."""
    refs = {}
    for row in snapshot.get('context', []):
        owner = row.get('sourceReference') or {}
        refs.setdefault((owner.get('provider'), owner.get('id')), set()).add(row.get('id'))
    return refs


def cited_context(refs, entries):
    ids = set()
    for entry in entries:
        for ref in (entry.get('sources') or []) if isinstance(entry, dict) else []:
            if isinstance(ref, dict):
                ids |= refs.get((ref.get('provider'), ref.get('id')), set())
    return ids


def validation_issue(error):
    """Name the field and the violated limit, so one repair can fix the exact value."""
    field = '.'.join(str(part) for part in error.absolute_path)
    limit = f' ({error.validator} {error.validator_value})' if error.validator in ('maxLength', 'minLength', 'maxItems') else ''
    return (f'{field}: ' if field else '') + error.message[:200] + limit


def split_entries(batch, key, schema, excerpts, indexed_sources, reason_words=None):
    """Validate findings one by one: a bad record must not discard verified siblings."""
    entry_schema = schema['properties'].get(key, {}).get('items') or {}
    accepted, rejected = [], []
    for index, entry in enumerate(batch.get(key, [])):
        try:
            if not isinstance(entry, dict):
                raise ValueError('Each entry must be an object.')
            if key == 'items' and indexed_sources:
                required = set(entry_schema.get('required', []))
                for name in list(entry):
                    if name not in required and entry[name] == '':
                        del entry[name]
            validate(entry, entry_schema)
            words = attention_reason_words(entry.get('reason', '')) if key == 'items' and reason_words else 0
            if reason_words and words > reason_words:
                raise ValueError(f'reason: {words} words is too many (maxWords {reason_words}); '
                                 'say why it matters now without repeating the title, time or location.')
            entry = deepcopy(entry)
            if indexed_sources:
                restore_entry_evidence(entry, excerpts)
            accepted.append(entry)
        except (ValueError, TypeError, KeyError, ValidationError) as error:
            message = validation_issue(error) if isinstance(error, ValidationError) else str(error)
            rejected.append({'key': key, 'index': index, 'error': message[:300], 'entry': entry})
    return accepted, rejected


def run_source_batch(dispatch, complete, schema, check_cancelled, review_schema=None, indexed_sources=False, reason_words=None):
    """reason_words: the card reason word limit, for the Center (M) lane only; S staging has none."""
    check_cancelled()
    snapshot = dispatch('query_world_items', {})
    if snapshot.get('error'):
        raise RuntimeError(str(snapshot['error']))
    required = set(snapshot.get('pendingContextIds', []))
    available = {row['id'] for row in snapshot.get('context', [])}
    references = context_references(snapshot)
    skipped = set(snapshot.get('skippedContextIds', [])) if review_schema is None else set()
    if not skipped <= required:
        raise ValueError('Invalid preprocessing acknowledgment.')
    schema = deepcopy(schema)
    if review_schema is not None:
        schema['properties']['reviews'] = {'type': 'array', 'maxItems': 20, 'items': review_schema}
    # Only published items can be updated by ID; Applet candidate IDs are private.
    item_schema = schema.get('properties', {}).get('items', {}).get('items', {})
    if 'id' in item_schema.get('properties', {}):
        ids = [row['id'] for row in snapshot.get('items', []) if isinstance(row.get('id'), str)]
        item_schema['properties']['id'] = {'enum': ids} if ids else False
        item_schema.setdefault('allOf', []).append({
            'if': {'properties': {'kind': {'const': 'event'}}, 'required': ['kind']},
            'then': {'required': ['start'], 'properties': {'start': {'type': 'string',
                'pattern': r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$'}}}})
    snapshot = deepcopy(snapshot)
    for candidate in snapshot.get('appletCandidates', []):
        candidate.pop('id', None)
    snapshot = {**snapshot, 'pendingContextIds': sorted(required-skipped)}
    excerpts = {}
    if indexed_sources:
        snapshot, schema, excerpts = indexed_source_evidence(snapshot, schema)
    # The envelope is validated whole; each finding is validated on its own below.
    envelope = deepcopy(schema)
    for key in ('items', 'reviews'):
        if key in envelope['properties']:
            envelope['properties'][key] = {**envelope['properties'][key], 'items': {}}
    # The model reads a schema that is the same on every pass, so the instruction, schema and system
    # prompt form one cacheable prefix; the per-pass ID list only validates (an unknown ID is repaired).
    prompt_schema = deepcopy(schema)
    prompt_item = prompt_schema.get('properties', {}).get('items', {}).get('items', {})
    if isinstance(prompt_item.get('properties', {}).get('id'), dict):
        prompt_item['properties']['id'] = {'type': 'string', 'description': 'Only the id of an existing entry in items; omit it for a new finding.'}
    evidence = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'))
    correction = ''
    for attempt in range(2):
        final = attempt == 1
        check_cancelled()
        try:
            if required and required == skipped:
                batch = {'items': [], 'processedContextIds': []}
            else:
                message = complete(evidence, prompt_schema, correction)
                check_cancelled()
                raw = message.strip()
                if raw.startswith('```') and raw.endswith('```'):
                    raw = raw.split('\n', 1)[1].rsplit('```', 1)[0]
                batch = json.loads(raw)
            validate(batch, envelope)
            items, rejected = split_entries(batch, 'items', schema, excerpts, indexed_sources, reason_words)
            reviews, rejected_reviews = split_entries(batch, 'reviews', schema, excerpts, indexed_sources)
            rejected += rejected_reviews
            processed = batch.get('processedContextIds', [])
            valid_ids = len(processed) == len(set(processed)) and set(processed) <= available
            complete_ids = required <= set(processed) | skipped
            if not final and (rejected or not valid_ids or not complete_ids):
                issues = [f"{row['key']}[{row['index']}]: {row['error']}" for row in rejected]
                if not valid_ids or not complete_ids:
                    issues.append('Acknowledge all pending context IDs once; use only supplied context IDs.')
                raise ValueError('\n'.join(issues))
        except (ValueError, TypeError, KeyError, ValidationError) as error:
            correction = (error.message if isinstance(error, ValidationError) else str(error))[:1000]
            continue
        # After the repair, keep every verified finding. Inputs cited by rejected findings
        # stay pending for a later, isolated retry; the host reports remaining coverage.
        withheld = cited_context(references, [row['entry'] for row in rejected])
        processed = [id for id in dict.fromkeys(processed) if id in available and id not in withheld]
        # Validate every JSON operation before writing. Once any write starts,
        # transport errors must not replay an ambiguous write.
        for review in reviews:
            check_cancelled()
            result = dispatch('review_world_item', review)
            if result.get('error'):
                withheld |= cited_context(references, [review])
        processed = [id for id in processed if id not in withheld]
        batch = {**{k: v for k, v in batch.items() if k != 'reviews'}, 'items': items,
                 'processedContextIds': list(dict.fromkeys([*processed, *sorted(skipped - withheld)]))}
        check_cancelled()
        result = dispatch('upsert_world_items', batch)
        if result.get('error') and not final and not reviews:
            correction = str(result['error'])[:600]
            if isinstance(result.get('evidenceIssues'), list):
                correction += '\nEvidence repair: ' + json.dumps(result['evidenceIssues'], ensure_ascii=False)[:2000]
            continue
        if result.get('error') and items:
            # Every finding was rejected: still commit inputs that produced none,
            # without another model call or replaying reviews.
            cited = cited_context(references, items)
            batch = {**batch, 'items': [], 'processedContextIds': [id for id in batch['processedContextIds'] if id not in cited]}
            result = dispatch('upsert_world_items', batch)
        if result.get('error'):
            raise RuntimeError(str(result['error']))
        return result
    raise RuntimeError('Background batch validation failed after one repair: ' + correction)
