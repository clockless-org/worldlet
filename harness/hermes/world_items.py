"""Worldlet owns these contracts and their durable state; Hermes calls them.

An attention item is one saved finding from one Applet: a task, an event or an update.
They fill the Attention Center, the left panel, and mark their Applet in the world.
Tool schemas come from the generated services.json (see world_contract.py); this
module only names the tools each background mode may use.
"""
MONITOR_TOOLS = {"read_world_source", "query_world_items", "upsert_world_items", "review_world_item", "read_world_history"}

# Context synthesis gets only saved observations. No source readers or action tools.
SYNTHESIS_TOOLS = {"query_world_items", "upsert_world_items", "review_world_item"}
