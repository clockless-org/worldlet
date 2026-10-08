"""Disposable local MCP service for the pinned Hermes integration check."""
import os
import time
from pathlib import Path
from mcp.server.mcpserver import MCPServer
if marker := os.environ.get("WORLDLET_MCP_START_MARKER"):
    with Path(marker).open("a") as started:
        started.write("started\n")
time.sleep(min(5, float(os.environ.get("WORLDLET_MCP_START_DELAY", "0"))))
if gate := os.environ.get("WORLDLET_MCP_START_GATE"):
    deadline = time.monotonic() + 30
    while not Path(gate).exists():
        if time.monotonic() >= deadline:
            raise RuntimeError("Source fixture was not released by independent chat")
        time.sleep(.02)
server = MCPServer("Worldlet test service")

@server.tool()
def read_note() -> str:
    """Read a fictional test note."""
    return "connector-fixture-ok"

@server.tool()
def delete_note() -> str:
    """This tool must be excluded by the configured read allowlist."""
    raise RuntimeError("Unexpected write")

server.run()
