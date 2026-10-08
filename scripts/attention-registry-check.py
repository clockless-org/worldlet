"""Resident monitor lane transitions against the installed Hermes registry; no accounts/model."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'harness/hermes'))
from monitor_tools import register_monitor_tools
from world_contract import schemas
from world_items import MONITOR_TOOLS, SYNTHESIS_TOOLS
from tools.registry import ToolRegistry

registry = ToolRegistry()
for turn, synthesis in enumerate([False, True, False, True]):
    expected = SYNTHESIS_TOOLS if synthesis else MONITOR_TOOLS
    toolset = 'worldlet-attention' if synthesis else 'worldlet-items'
    register_monitor_tools(registry, schemas(), lambda name, args, t=turn: {'turn':t}, synthesis=synthesis)
    assert set(registry.get_tool_names_for_toolset(toolset)) == expected
    entry = registry.get_entry('upsert_world_items')
    assert json.loads(entry.handler({'items':[], **({'processedContextIds':[]} if synthesis else {})})) == {'turn':turn}, 'No stale callback from the previous turn'
    assert entry.schema['parameters']['properties']['items']['maxItems'] == 1
    assert 'terminal' not in registry.get_tool_names_for_toolset(toolset)

try:
    register_monitor_tools(ToolRegistry(), [], lambda *_: {}, synthesis=True)
except RuntimeError:
    pass
else:
    raise AssertionError('Missing monitor toolset must fail closed')
foreign = ToolRegistry()
foreign.register(name='query_world_items', toolset='foreign', schema={'name':'query_world_items'}, handler=lambda *_: {})
try:
    register_monitor_tools(foreign, schemas(), lambda *_: {}, synthesis=True)
except RuntimeError:
    pass
else:
    raise AssertionError('Must not replace another tool owner')
print('PASS resident collection/synthesis transitions, fresh callbacks, incremental schema, missing tools and ownership guards')

for analysis in [True, False, True]:
    register_monitor_tools(registry, schemas(), lambda name, args: {'count':len(args.get('items',[]))}, synthesis=True, source_analysis=analysis)
    entry=registry.get_entry('upsert_world_items')
    assert entry.schema['parameters']['properties']['items']['maxItems'] == (20 if analysis else 1)
    assert 'read_world_source' not in registry.get_tool_names_for_toolset('worldlet-attention')
print('PASS analyst batch schema switches independently of progressive Center publication')

from jsonschema import ValidationError
entry=registry.get_entry('upsert_world_items')
try:
    entry.handler({'items':[]})
except ValidationError as error:
    assert error.validator=='required'
else:
    raise AssertionError('Receipt-driven saves must explicitly report coverage')
assert json.loads(entry.handler({'items':[], 'processedContextIds':[]}))=={'count':0}
print('PASS receipt-driven lanes require explicit coverage; empty progress remains honest')
