"""Execute the shipped Google dispatcher with an API fixture; no account/network."""
import ast
import datetime
import importlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import types

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "harness/hermes"))
tree = ast.parse((root / "harness/hermes/host.py").read_text(encoding="utf-8"))
dispatch = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_google")
with tempfile.TemporaryDirectory(prefix="worldlet-calendar-api-") as temporary:
    home = Path(temporary)
    scripts = home / "skills/productivity/google-workspace/scripts"
    scripts.mkdir(parents=True)
    (scripts / "setup.py").write_text("from pathlib import Path\nTOKEN_PATH=Path(__file__)\n", encoding="utf-8")
    sys.modules["run_agent"] = types.SimpleNamespace(__file__=str(home / "run_agent.py"))
    calls = []
    wrong = False
    class Result:
        def __init__(self, value): self.value = value
        def execute(self): return self.value
    class Events:
        def get(self, **arguments):
            calls.append(("get", arguments))
            return Result({"id": "other" if wrong else arguments["eventId"], "summary": "Past original", "description": "Original event body"})
        def list(self, **arguments):
            calls.append(("list", arguments))
            return Result({"summary": "Primary calendar", "items": [{"id": "next_event"}]})
    def build_service(name, version):
        assert (name, version) == ("calendar", "v3")
        return types.SimpleNamespace(events=lambda: Events())
    sys.modules["google_api"] = types.SimpleNamespace(build_service=build_service)
    namespace = {"Path": Path, "sys": sys, "importlib": importlib, "datetime": datetime, "HERMES_DIR": home}
    exec(compile(ast.Module(body=[dispatch, next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_google_reads')], type_ignores=[]), "shipped-google-dispatch", "exec"), namespace)
    read = namespace["_google"]
    result = read({"operation": "read", "service": "google-calendar", "id": "past_event_20200101T000000Z"})
    assert calls == [("get", {"calendarId": "primary", "eventId": "past_event_20200101T000000Z"})]
    assert result["records"][0]["data"]["description"] == "Original event body"
    assert result["records"][0]["id"] == "past_event_20200101T000000Z"
    for invalid in ["../other", "https://attacker.invalid", "x" * 257, "event世界", [], None]:
        before = len(calls)
        try: read({"operation": "read", "service": "google-calendar", "id": invalid})
        except ValueError: pass
        else: raise AssertionError("Invalid event ID accepted")
        assert len(calls) == before
    wrong = True
    try: read({"operation": "read", "service": "google-calendar", "id": "requested"})
    except ValueError: pass
    else: raise AssertionError("Substituted event accepted")
    result = read({"operation": "read", "service": "google-calendar"})
    assert calls[-1][0] == "list" and calls[-1][1]["maxResults"] == 20 and "timeMax" in calls[-1][1]
    assert result["records"][0]["id"] == "next_event"
    assert calls[-1][1]["calendarId"] == "primary" and calls[-1][1]["singleEvents"] is True
    result = read({"operation": "test", "service": "google-calendar"})
    assert result["records"] == [] and result["label"] == "Primary calendar"
    assert calls[-1][1]["maxResults"] == 1 and calls[-1][1]["fields"] == "summary"
print("PASS shipped Calendar read: exact past-event lookup, identity validation, bounded upcoming list and connection probe; no account or network.")
