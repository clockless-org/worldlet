"""Task-tier routing over the host's model sources (contracts/model-sources.json).

The host picks one source and supplies its credential (WORLDLET_MODEL_SOURCE); this
module only maps a task to that source's tier model. On a person's own provider, small
work (S) uses the smallest current model that provider offers, chosen here from Hermes'
live catalog; everything else uses the model they chose. Hermes owns user connections.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse


def _catalog():
    here = Path(__file__).parent
    # Bundled next to the Harness; a source checkout reads the contract directly.
    for path in (here / "model-sources.json", here.parents[1] / "contracts" / "model-sources.json"):
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise RuntimeError("Model sources are missing from this build.")


CATALOG = _catalog()
TIERS = CATALOG["tiers"]


def source(source_id):
    """A catalog source with `extends` resolved, or None."""
    entry = CATALOG["sources"].get(source_id)
    if entry is None:
        return None
    parent = source(entry["extends"]) if entry.get("extends") else {}
    return {**parent, **{k: v for k, v in entry.items() if k != "extends"}, "id": source_id}


SOURCES = {name: source(name) for name in CATALOG["sources"]}
# Worldlet's own model service is retired (owner decision 2026-10-05: Worldlet provides no model). A saved
# configuration that still names it, by source or endpoint, is replaced by the host's source like a fresh one.
RETIRED_SOURCES = {"worldlet", "worldlet-dev", "worldlet-production"}
RETIRED_ENDPOINTS = ("https://worldlet-model.clockless.workers.dev/v1", "https://worldlet-model-dev.clockless.workers.dev/v1")


def _same_endpoint(a, b):
    a, b = urlparse(a if isinstance(a, str) else ""), urlparse(b if isinstance(b, str) else "")
    return a.scheme == "https" and (a.scheme, a.netloc, a.path.rstrip("/")) == (b.scheme, b.netloc, b.path.rstrip("/"))


def included_endpoint(base_url):
    """A Worldlet model service endpoint: HTTPS, exact host and API root from the catalog."""
    return any(s["credential"] == "included" and _same_endpoint(base_url, s["baseURL"]) for s in SOURCES.values())


def retired(config):
    """A saved model configuration on Worldlet's retired model service, which the host's source replaces."""
    config = config or {}
    # The earliest included default, DeepSeek V4 Flash through OpenCode Go, counts too.
    earliest = str(config.get("base_url", "")).rstrip("/") == "https://opencode.ai/zen/go/v1" and config.get("default") == "deepseek-v4-flash"
    return earliest or config.get("worldlet_source") in RETIRED_SOURCES or any(_same_endpoint(config.get("base_url"), url) for url in RETIRED_ENDPOINTS)


def active_source():
    """The source the host chose for this process. An attached external Hermes keeps its own model."""
    if os.environ.get("WORLDLET_EXTERNAL_AGENT") == "1":
        return None
    chosen = os.environ.get("WORLDLET_MODEL_SOURCE", "")
    if chosen in SOURCES:
        return chosen
    # Older hosts name only the included endpoint.
    url = os.environ.get("WORLDLET_INCLUDED_URL")
    return next((name for name, s in SOURCES.items() if s["credential"] == "included" and _same_endpoint(url, s["baseURL"])), None) if url else None


def source_model(source_id):
    """The Hermes model configuration for a catalog source."""
    s = SOURCES[source_id]
    config = {"provider": s["provider"], "default": s["model"], "base_url": s["baseURL"], "worldlet_source": source_id}
    if s["credential"] == "included":
        config.update(api_key="${WORLDLET_INCLUDED_TOKEN}", default_headers=s.get("headers") or {})
    return config


def configured_source(config):
    """The catalog source a saved Hermes model configuration belongs to, if any."""
    config = config or {}
    named = config.get("worldlet_source") or ("local-codex" if config.get("worldlet_route") == "local-codex" else None)
    if named in SOURCES and config.get("provider") == SOURCES[named]["provider"]:
        return named
    return next((name for name, s in SOURCES.items() if s["credential"] == "included" and _same_endpoint(config.get("base_url"), s["baseURL"])), None)


def task_tier(body):
    # Cross-source judgement keeps M; individual source checks/derivations use S.
    if body.get("attentionSynthesis"):
        return "background-M"
    if body.get("monitor") or body.get("mode", "chat") not in {"chat", "setup"}:
        return "S"
    # L/XL are deliberately opt-in by a task caller, never a keyword guess.
    return body.get("modelTier") if body.get("modelTier") in {"L", "XL"} else "M"


def routed_source(config):
    """A configured source whose tiers apply here. Personal sources route only when this host chose them."""
    name = configured_source(config)
    if name and (not SOURCES[name].get("personal") or name == active_source() or SOURCES[name]["credential"] == "included"):
        return name
    return None


def task_model(config, body):
    name = routed_source(config)
    if not name:
        default = (config or {}).get("default", "")
        # The person's own provider: Worldlet chooses its small model for small work (owner 2026-10-07: "不要用户分配
        # 我们智能分配"); everything else uses the model they chose. A catalog source this process was not started
        # with keeps one model.
        return (small_model(config) or default) if default and task_tier(body) == "S" and not configured_source(config) else default
    return SOURCES[name]["tiers"][task_tier(body)]["model"]


def pick_small(default, ids, families, exclude, recency):
    """The newest small model in `ids` (one of Hermes' fast `families`), preferring the vendor of `default`
    ("anthropic/…" on a mixed catalog), or "" when the catalog has none or `default` already is one."""
    def small(model_id):
        lowered = model_id.lower()
        return next((rank for rank, family in enumerate(families) if family in lowered), None) if not any(x in lowered for x in exclude) else None
    if not default or small(default) is not None:
        return ""
    vendor = default.split("/", 1)[0] + "/" if "/" in default else ""
    candidates = [m for m in dict.fromkeys(str(m) for m in ids or []) if m and m != default and small(m) is not None]
    for pool in ([m for m in candidates if vendor and m.startswith(vendor)], candidates):
        if pool:
            # The newest release first (gpt-5.6-mini before gpt-5.4-mini); Hermes' family order breaks ties.
            return sorted(sorted(pool, key=small), key=recency, reverse=True)[0]
    return ""


_SMALL = {}
# Hermes' fast families serve one-line titles; S work reads mail and answers in a schema, so the tiniest models
# (nano, lite) stay out and the next family (mini, flash, haiku) is used.
SMALL_TOO_WEAK = ("nano", "lite")


def small_model(config):
    """The small model for S work on the person's own provider, chosen from what that provider offers right now
    (Hermes' live, cached catalog and its own fast-model families), or "" to keep their model. Never raises."""
    config = config or {}
    provider, default = str(config.get("provider") or "").strip().lower(), str(config.get("default") or "")
    key = (provider, str(config.get("base_url") or ""), default)
    if key in _SMALL:
        return _SMALL[key]  # "" once the provider refused it (small_refused)
    picked = ""
    try:
        if provider == "openai-codex":
            # A Codex account of their own: the same small model the Codex sign-in on this computer uses.
            picked = SOURCES["local-codex"]["tiers"]["S"]["model"] if default != SOURCES["local-codex"]["tiers"]["S"]["model"] else ""
        else:
            from agent.auxiliary_client import _FAST_MODEL_EXCLUDE, _FAST_MODEL_FAMILIES, _model_recency_key
            if provider in ("", "custom", "auto"):
                from hermes_cli.models import cached_fetch_api_models
                ids = cached_fetch_api_models(config.get("api_key") or None, config.get("base_url"), timeout=5.0) if config.get("base_url") else None
            else:
                from hermes_cli.models import provider_model_ids
                ids = provider_model_ids(provider)
            picked = pick_small(default, ids or [], _FAST_MODEL_FAMILIES, _FAST_MODEL_EXCLUDE + SMALL_TOO_WEAK, _model_recency_key)
    except Exception:
        picked = ""
    # A failed catalog read is not remembered, so the next small task asks again.
    if picked:
        _SMALL[key] = picked
    return picked


def tier_reasoning(config):
    """Per-model reasoning effort from the routed source's tiers (model -> effort)."""
    name = routed_source(config)
    return {t["model"]: t["reasoning"] for t in SOURCES[name]["tiers"].values() if t.get("reasoning")} if name else {}


def energy_fallback(chain):
    """The person's own Hermes `fallback_providers`, in their order.

    Worldlet's free daily charge once sat last in this chain; Worldlet provides no model any more (owner
    decision 2026-10-05), so any entry a host added for it (`worldlet_source`) is dropped.
    """
    return [entry for entry in (chain if isinstance(chain, list) else [chain] if isinstance(chain, dict) else [])
            if isinstance(entry, dict) and not entry.get("worldlet_source")]


def small_fallback(config, model, runtime):
    """When S work runs on a small model Worldlet chose, the person's own model stands behind it in Hermes' fallback
    chain, so a small model the provider refuses (retired, not on their plan) never fails the work."""
    default = (config or {}).get("default", "")
    if not default or model == default or configured_source(config):
        return None
    entry = {"provider": runtime.get("provider") or (config or {}).get("provider") or "custom", "model": default}
    if runtime.get("base_url"):
        entry["base_url"] = runtime["base_url"]
    if runtime.get("api_key"):
        entry["api_key"] = runtime["api_key"]
    return entry


def small_refused(config, model, used):
    """The provider refused the small model (Hermes fell back to the person's own): keep their model for S work
    for the rest of this process."""
    config = config or {}
    if used and used != model and model != config.get("default"):
        _SMALL[(str(config.get("provider") or "").strip().lower(), str(config.get("base_url") or ""), str(config.get("default") or ""))] = ""
