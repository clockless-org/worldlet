"""Rebind Worldlet-owned tools when the resident monitor changes lanes.

A missing toolset must fail before Desktop can fall back to general CLI tools.
"""
import json
from attention_policy import incremental_schema, analysis_schema, coverage_schema
from monitor_context import query_schema, context_page
from world_items import MONITOR_TOOLS, SYNTHESIS_TOOLS


def register_monitor_tools(registry, definitions, dispatch, *, synthesis, source_analysis=False):
    from jsonschema import validate
    if source_analysis and not synthesis:
        raise ValueError("Source analysis requires the read-free synthesis toolset.")
    context_cache = {}
    allowed = SYNTHESIS_TOOLS if synthesis else MONITOR_TOOLS
    toolset = 'worldlet-attention' if synthesis else 'worldlet-items'
    for original in definitions:
        if original['name'] not in allowed:
            continue
        definition = analysis_schema(original) if source_analysis else incremental_schema(original)
        if synthesis:
            definition = query_schema(coverage_schema(definition))
        name = definition['name']
        previous = registry.get_toolset_for_tool(name)
        if previous not in (None, 'worldlet-items', 'worldlet-attention'):
            raise RuntimeError('Attention tool ownership conflict.')
        def handler(args, _name=name, _schema=definition['parameters'], _paged=synthesis, **_):
            validate(args, _schema)
            if _paged and _name == 'query_world_items':
                request = dict(args)
                page = request.pop('contextPage', 0)
                if page == 0:
                    context_cache['snapshot'] = dispatch(_name, request)
                if 'snapshot' not in context_cache:
                    return json.dumps({'error': 'Query contextPage 0 before reading later pages.'})
                return json.dumps(context_page(context_cache['snapshot'], page), ensure_ascii=False)
            return json.dumps(dispatch(_name, args), ensure_ascii=False)
        registry.register(name=name, toolset=toolset, schema=definition, handler=handler, override=True)
    if set(registry.get_tool_names_for_toolset(toolset)) != allowed:
        raise RuntimeError('Attention tools are unavailable; refusing a fallback toolset.')
