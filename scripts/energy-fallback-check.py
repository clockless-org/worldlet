"""Worldlet provides no model (owner decision 2026-10-05): no free daily charge behind the person's own model.

Pure catalog logic, no Hermes runtime: the chain written into Hermes' `fallback_providers` keeps only the person's
own entries, and a profile saved on the retired Worldlet model service is replaced by the host's source.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "harness/hermes"))
import model_tiers  # noqa: E402

mine = {"provider": "openrouter", "model": "deepseek/deepseek-chat"}
old = {"provider": "custom", "model": "worldlet-m", "base_url": "https://worldlet-model.clockless.workers.dev/v1",
       "key_env": "WORLDLET_INCLUDED_TOKEN", "worldlet_source": "worldlet"}

# The free charge an earlier release appended is dropped; the person's own entries stay, in order.
assert model_tiers.energy_fallback([mine, old]) == [mine]
assert model_tiers.energy_fallback([old]) == []
assert model_tiers.energy_fallback(None) == []
assert model_tiers.energy_fallback(mine) == [mine]
assert "worldlet" not in model_tiers.SOURCES, "the Worldlet model service is no source"

# Profiles saved on the retired service are replaced like a fresh one; the person's own providers are not.
for saved in ({"provider": "custom", "default": "@cf/deepseek-ai/deepseek-v4-flash-0731", "base_url": "https://worldlet-model.clockless.workers.dev/v1/"},
              {"provider": "custom", "default": "x", "base_url": "https://worldlet-model-dev.clockless.workers.dev/v1", "worldlet_source": "worldlet-dev"},
              {"provider": "custom", "default": "worldlet-m", "worldlet_source": "worldlet"},
              {"provider": "custom", "default": "deepseek-v4-flash", "base_url": "https://opencode.ai/zen/go/v1"}):
    assert model_tiers.retired(saved), saved
for own in ({"provider": "custom", "default": "my-model", "base_url": "https://models.example/v1"},
            {"provider": "custom", "default": "kimi-k2", "base_url": "https://opencode.ai/zen/go/v1"},
            {"provider": "custom", "default": "x", "base_url": "https://worldlet-model.clockless.workers.dev.evil.test/v1"},
            {"provider": "anthropic", "default": "claude-sonnet"}, None):
    assert not model_tiers.retired(own), own
print("PASS energy: no free daily charge; own fallbacks kept in order; retired Worldlet profiles replaced")
