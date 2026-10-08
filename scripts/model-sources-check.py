"""One model-source catalog: the host names a source, the Harness maps tiers to it.

Every build routes every tier to this computer's Codex sign-in, read-only, unless the
person's own provider is configured: Worldlet provides no model (owner decision 2026-10-05).
No network or real account: a fictional Codex auth.json stands in for the sign-in.
"""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
PYTHON = Path(os.environ["WORLDLET_HERMES_PYTHON"]) if os.environ.get("WORLDLET_HERMES_PYTHON") else ROOT / ".local/hermes-source/.venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
HOST = ROOT / "dist/WorldletWeb/hermes/host.py"
sys.path.insert(0, str(ROOT / "harness/hermes"))
import model_tiers  # noqa: E402

# The catalog is complete and unambiguous.
for name, source in model_tiers.SOURCES.items():
    assert set(source["tiers"]) == set(model_tiers.TIERS), name
    efforts = {}
    for tier in source["tiers"].values():
        assert efforts.setdefault(tier["model"], tier.get("reasoning")) == tier.get("reasoning"), f"{name}: one reasoning effort per model"
    assert source["credential"] in {"included", "codex-local"} and source["baseURL"].startswith("https://"), name
# The Electron host agrees with it: Codex on this computer is the only source.
host = (ROOT / "platform/electron/src/modules/agent-runtime/model-access.ts").read_text()
assert set(model_tiers.SOURCES) == {"local-codex"}, "Worldlet provides no model: no Worldlet source"
assert "return 'local-codex';" in host and "worldlet-model" not in host, "the Electron host names only the Codex source"

os.environ["WORLDLET_MODEL_SOURCE"] = "local-codex"
codex = model_tiers.source_model("local-codex")
expected = {"chat": "gpt-5.6-terra", "setup": "gpt-5.6-terra", "monitor": "gpt-5.6-luna", "derive": "gpt-5.6-luna",
            "synthesis": "gpt-5.6-terra", "L": "gpt-5.6-sol", "XL": "gpt-6-astra"}
bodies = {"chat": {"mode": "chat"}, "setup": {"mode": "setup"}, "monitor": {"monitor": True}, "derive": {"mode": "context_analysis"},
          "synthesis": {"monitor": True, "attentionSynthesis": True}, "L": {"modelTier": "L"}, "XL": {"modelTier": "XL"}}
assert {name: model_tiers.task_model(codex, body) for name, body in bodies.items()} == expected
assert model_tiers.configured_source({"provider": "openai-codex", "worldlet_route": "local-codex"}) == "local-codex", "profiles saved before the catalog keep routing"
assert model_tiers.configured_source({"provider": "custom", "worldlet_source": "worldlet-dev"}) is None, "a profile on the retired service names no source"
assert not model_tiers.included_endpoint("https://worldlet-model.clockless.workers.dev/v1"), "the retired service is not an included endpoint"
own = {"provider": "custom", "default": "my-model", "base_url": "https://models.example/v1"}
assert model_tiers.task_model(own, {"monitor": True, "attentionSynthesis": True}) == "my-model", "Center synthesis keeps the person's own model"

# The person's own provider (owner 2026-10-07: "不要用户分配 我们智能分配"): Worldlet picks the small model for S
# work from what the provider offers; chat, setup and the Center keep the model they chose.
families, exclude = ("gpt-mini-latest", "gpt-5.4-mini", "-nano", "-mini", "-flash", "haiku"), ("codex", "o4-", "-realtime") + model_tiers.SMALL_TOO_WEAK
newest = lambda m: tuple((1, float(p), "") if i % 2 else (0, 0.0, p) for i, p in enumerate(re.split(r"(\d+(?:\.\d+)?)", m.lower())) if p)
pick = lambda default, ids: model_tiers.pick_small(default, ids, families, exclude, newest)
assert pick("claude-sonnet-5-5", ["claude-opus-4-8", "claude-sonnet-5-5", "claude-3-haiku-20240307", "claude-haiku-4-5-20251001"]) == "claude-haiku-4-5-20251001"
assert pick("gpt-5.6", ["gpt-5.6", "gpt-5.4-mini", "gpt-5.6-mini", "gpt-5.6-nano", "gpt-5.6-codex-mini", "o4-mini", "gpt-5.6-mini-realtime"]) == "gpt-5.6-mini", "the newest small release, never nano, codex or realtime"
assert pick("anthropic/claude-sonnet-5-5", ["openai/gpt-5.6-mini", "anthropic/claude-haiku-4.5"]) == "anthropic/claude-haiku-4.5", "the same vendor on a mixed catalog"
assert pick("gemini-3.6-pro", ["gemini-3.6-pro", "gemini-3.6-flash-lite", "gemini-3.6-flash"]) == "gemini-3.6-flash"
assert pick("claude-haiku-4-5", ["claude-haiku-4-5", "claude-3-haiku"]) == "", "a small model already is the small model"
assert pick("deepseek-v4", ["deepseek-v4", "deepseek-r1"]) == "" and pick("my-model", []) == "", "no small model offered: keep theirs"
key = ("anthropic", "", "claude-sonnet-5-5")
mine = {"provider": "anthropic", "default": "claude-sonnet-5-5"}
model_tiers._SMALL[key] = "claude-haiku-4-5"
assert {name: model_tiers.task_model(mine, body) for name, body in {"chat": {"mode": "chat"}, "setup": {"mode": "setup"}, "monitor": {"monitor": True},
        "derive": {"mode": "context_analysis"}, "synthesis": {"monitor": True, "attentionSynthesis": True}}.items()} == {
        "chat": "claude-sonnet-5-5", "setup": "claude-sonnet-5-5", "monitor": "claude-haiku-4-5", "derive": "claude-haiku-4-5", "synthesis": "claude-sonnet-5-5"}
runtime = {"provider": "anthropic", "base_url": "https://api.anthropic.com", "api_key": "fixture-key"}
assert model_tiers.small_fallback(mine, "claude-haiku-4-5", runtime) == {"provider": "anthropic", "model": "claude-sonnet-5-5", "base_url": "https://api.anthropic.com", "api_key": "fixture-key"}, "their own model stands behind the small one"
assert model_tiers.small_fallback(mine, "claude-sonnet-5-5", runtime) is None
model_tiers.small_refused(mine, "claude-haiku-4-5", "claude-haiku-4-5")
assert model_tiers.task_model(mine, {"monitor": True}) == "claude-haiku-4-5", "a small model that answered stays"
model_tiers.small_refused(mine, "claude-haiku-4-5", "claude-sonnet-5-5")
assert model_tiers.task_model(mine, {"monitor": True}) == "claude-sonnet-5-5", "a small model the provider refused is not asked again"
model_tiers._SMALL.clear()
os.environ["WORLDLET_EXTERNAL_AGENT"] = "1"
assert model_tiers.active_source() is None, "An attached Hermes keeps its own model"
del os.environ["WORLDLET_EXTERNAL_AGENT"], os.environ["WORLDLET_MODEL_SOURCE"]
assert model_tiers.task_model(codex, {"monitor": True}) == codex["default"], "Codex routes by tier only in a process the host started with it"
os.environ["WORLDLET_INCLUDED_URL"] = "https://worldlet-model.clockless.workers.dev/v1"
assert model_tiers.active_source() is None, "an older host naming the retired endpoint selects nothing"
del os.environ["WORLDLET_INCLUDED_URL"]
print("PASS model sources: Codex on this computer is the only source; local Codex S luna, M terra, L sol, XL astra; own providers get a small model chosen for S work, their own model behind it; no Worldlet model.")


def token(expires):
    part = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    return ".".join([part({"alg": "none"}), part({"exp": int(time.time() + expires)}), "fixture"])


def run(home, body, env):
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("WORLDLET_", "HERMES_", "CODEX_"))}
    clean.update(HERMES_HOME=str(home), HERMES_INTERACTIVE="0", PYTHONUTF8="1", **env)
    result = subprocess.run([str(PYTHON), str(HOST)], input=json.dumps(body) + "\n", capture_output=True, text=True,
                            encoding="utf-8", env=clean, timeout=90)
    assert result.returncode == 0, result.stderr[-4000:]
    return json.loads(result.stdout.strip().splitlines()[-1])["value"]


with tempfile.TemporaryDirectory(prefix="worldlet-local-codex-") as directory:
    root = Path(directory)
    sign_in = root / "codex/auth.json"
    sign_in.parent.mkdir()
    sign_in.write_text(json.dumps({"auth_mode": "chatgpt", "tokens": {"access_token": token(3600), "refresh_token": "fixture-refresh"}}))
    original = sign_in.read_bytes()
    dev = {"WORLDLET_MODEL_SOURCE": "local-codex", "CODEX_HOME": str(sign_in.parent)}
    home = root / "hermes"
    status = run(home, {"action": "status"}, dev)
    assert status["ready"] and status["isDefault"] and status["provider"] == "openai-codex", status
    assert status["model"] == "gpt-5.6-terra" and status["name"] == model_tiers.SOURCES["local-codex"]["name"], status
    config = (home / "config.yaml").read_text()
    assert all(f"{model}: {effort}" in config for model, effort in model_tiers.tier_reasoning(codex).items()), config
    assert not (home / "auth.json").exists(), "The Codex sign-in is never copied into Hermes"

    probe = f"""
import sys; sys.path.insert(0, {str(HOST.parent)!r})
import model_access
model_access.bind_local_codex()
from hermes_cli import auth
assert auth.resolve_codex_runtime_credentials(force_refresh=True)["provider"] == "openai-codex"
for attempt in (lambda: auth.refresh_codex_oauth_pure("a", "b"), lambda: auth._save_codex_tokens({{"access_token": "x"}})):
    try: attempt()
    except auth.AuthError as error: assert error.code == "codex_local_readonly"
    else: raise AssertionError("Development rotated the Codex sign-in")
"""
    subprocess.run([str(PYTHON), "-c", probe], check=True, env={**os.environ, **dev, "HERMES_HOME": str(home)}, timeout=60)
    assert sign_in.read_bytes() == original, "The Codex sign-in file is read-only to Worldlet"

    sign_in.write_text(json.dumps({"tokens": {"access_token": token(-60)}}))
    assert not run(home, {"action": "status"}, dev)["ready"], "An expired Codex sign-in is not ready"

    # A profile saved on the retired Worldlet model service moves to the Codex sign-in.
    config = (home / "config.yaml").read_text()
    (home / "config.yaml").write_text(re.sub(r"(?m)^model:\n(?:  .*\n)*", "model:\n  provider: custom\n  default: worldlet-m\n  base_url: https://worldlet-model.clockless.workers.dev/v1\n  worldlet_source: worldlet\n", config, count=1))
    sign_in.write_text(json.dumps({"tokens": {"access_token": token(3600)}}))
    moved = run(home, {"action": "status"}, dev)
    assert moved["provider"] == "openai-codex" and moved["source"] == "local-codex", moved
    assert "worldlet-model" not in (home / "config.yaml").read_text(), "nothing is left pointing at the retired service"
# small_model reads Hermes' own fast families and provider catalog (stubbed here: no network).
probe = f"""
import sys; sys.path.insert(0, {str(HOST.parent)!r})
import model_tiers
from hermes_cli import models
models.provider_model_ids = lambda provider, **_: ["claude-opus-4-8", "claude-sonnet-5-5", "claude-haiku-4-5-20251001"] if provider == "anthropic" else []
models.cached_fetch_api_models = lambda key, url, **_: ["acme-large", "acme-flash"] if url == "https://models.example/v1" else None
assert model_tiers.small_model({{"provider": "anthropic", "default": "claude-sonnet-5-5"}}) == "claude-haiku-4-5-20251001"
assert model_tiers.small_model({{"provider": "custom", "default": "acme-large", "base_url": "https://models.example/v1"}}) == "acme-flash"
assert model_tiers.small_model({{"provider": "custom", "default": "x", "base_url": "https://down.example/v1"}}) == ""
assert model_tiers.small_model({{"provider": "openai-codex", "default": "gpt-5.6-terra"}}) == "gpt-5.6-luna"
"""
subprocess.run([str(PYTHON), "-c", probe], check=True, env={**os.environ, "HERMES_HOME": tempfile.mkdtemp(prefix="worldlet-small-model-")}, timeout=60)
print("PASS the small model comes from Hermes' own catalog and fast families for API-key, compatible and Codex providers.")
print("PASS every build borrows the Codex sign-in read-only; a profile on the retired Worldlet model service moves to it.")
