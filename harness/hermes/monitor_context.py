"""Bounded, whole-record monitor pages; never spill private context to an unreadable file."""
import json
from copy import deepcopy

PAGE_CHARS = 24000
ARRAYS = ('items', 'appletCandidates', 'context')
FIELDS = ('userContext', 'attentionFocus', 'timeZone', 'pendingContextIds')


def query_schema(definition):
    if definition['name'] != 'query_world_items':
        return definition
    result = deepcopy(definition)
    result['parameters']['properties']['contextPage'] = {'type': 'integer', 'minimum': 0}
    result['description'] += (' Background context is paginated. Start at contextPage 0 and follow nextContextPage '
                              'one call at a time until null. Later pages retain the same snapshot; page 0 refreshes it. Pages retain complete records and source quotes. '
                              'Read prior decisions before proposing changes. Acknowledge only records actually considered; '
                              'pendingContextIds covers the whole batch, not just this page.')
    return result


def context_page(result, page):
    if not isinstance(result, dict) or result.get('error'):
        return result
    header = {k: result[k] for k in FIELDS if k in result}
    # Leave room for the paging envelope itself. Records are not shortened.
    def size(value):
        return len(json.dumps(value, ensure_ascii=False))
    if size(header) > PAGE_CHARS // 2:
        raise ValueError('Monitor context metadata exceeds its bounded page budget.')
    pages = []
    current = {**header, **{k: [] for k in ARRAYS}}
    for field in ARRAYS:
        for row in result.get(field, []):
            current[field].append(row)
            if size(current) > PAGE_CHARS - 1000:
                current[field].pop()
                if any(current[k] for k in ARRAYS):
                    pages.append(current)
                current = {**header, **{k: [] for k in ARRAYS}}
                current[field].append(row)
                if size(current) > PAGE_CHARS - 1000:
                    raise ValueError('A monitor context record exceeds its bounded page budget.')
    if any(current[k] for k in ARRAYS) or not pages:
        pages.append(current)
    if page >= len(pages):
        return {'error': 'Context page is out of range; query contextPage 0.', 'contextPages': len(pages)}
    return {**pages[page], 'contextPage': page, 'contextPages': len(pages),
            'nextContextPage': page + 1 if page + 1 < len(pages) else None}
