"""Resolved Core persona through real Hermes with a loopback model and temp profile."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("fixture", root / "scripts/hermes-check.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
server = fixture.http.server.ThreadingHTTPServer(("127.0.0.1", 0), fixture.Model)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix="worldlet-persona-") as folder:
        home = Path(folder)
        (home / "config.yaml").write_text(json.dumps({"model": {"provider": "custom", "default": "fixture-model",
            "base_url": f"http://127.0.0.1:{server.server_port}/v1"}, "tools": {"tool_search": {"enabled": "off"}}}))
        soul = "Legacy personality fixture. This file must remain unchanged."
        (home / "SOUL.md").write_text(soul)
        for mode, custom in [("chat", ""), ("setup", ""), ("chat", "Formal, precise, and calm.")]:
            prompt = subprocess.check_output(["node", "--input-type=module", "-e",
                "import {companionPersonaPrompt} from './core/companion/index.ts'; console.log(companionPersonaPrompt('Nova',process.argv[1]));", custom], cwd=root, text=True).strip()
            fixture.requests_seen.clear()
            fixture.run(home, {"action": "chat", "mode": mode, "session": mode + ("-custom" if custom else "-default"), "text": "Hello", "style": prompt})
            systems = "\n".join(str(m["content"]) for r in fixture.requests_seen for m in r.get("messages", []) if m["role"] == "system")
            assert prompt in systems, "Resolved Core context was not preserved in Hermes system prompt"
            assert "How the user asked you to speak, in their words:" not in systems
            assert (home / "SOUL.md").read_text() == soul
            assert "Hermes Agent" not in systems and "Nous Research" not in systems, "Hermes' identity reached the model"
        # A SOUL.md Hermes seeded itself becomes the companion's persona (harness/hermes/persona.py).
        import sys
        sys.path.insert(0, str(root / "harness/hermes"))
        import persona
        (home / "SOUL.md").write_text(persona.HERMES_SOULS[0])
        fixture.requests_seen.clear()
        fixture.run(home, {"action": "chat", "mode": "chat", "session": "chat-seeded", "text": "Hello", "style": prompt})
        systems = "\n".join(str(m["content"]) for r in fixture.requests_seen for m in r.get("messages", []) if m["role"] == "system")
        assert (home / "SOUL.md").read_text() == persona.SOUL.strip() + "\n"
        assert persona.SOUL.strip() in systems and "Hermes Agent" not in systems and "Nous Research" not in systems
        print("PASS Hermes default/custom persona and setup context, legacy SOUL unchanged, Hermes' seeded SOUL replaced (loopback model)")
finally:
    server.shutdown()
