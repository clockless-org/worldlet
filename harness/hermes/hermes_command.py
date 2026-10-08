"""`hermes` for Fox's Hermes profile, the standard Hermes Agent Worldlet sets up for people with no Agent of their own.

Runs the official Hermes command line on Worldlet's runtime. When the profile's model is this computer's Codex
sign-in (the source Worldlet chose, `worldlet_source: local-codex`), it is borrowed read-only exactly as Fox does
(model_access.bind_model_auth): Codex refresh tokens are single-use, so refreshing one here would sign the Codex
app out. A model the person sets with `hermes model` is used as-is.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def borrow_codex():
    from hermes_cli.config import load_config
    from model_tiers import configured_source
    if configured_source(load_config().get("model")) != "local-codex":
        return
    os.environ["WORLDLET_MODEL_SOURCE"] = "local-codex"
    os.environ.pop("WORLDLET_EXTERNAL_AGENT", None)
    from model_access import bind_model_auth
    bind_model_auth(None)


def borrow_codex_for(profile):
    """The same borrow for Hermes run as `python -m hermes_cli.main` on Worldlet's runtime without this file: its resident
    gateway service (owner decision 2026-10-08, Hermes Agent kept running). Worldlet's hook in that runtime's
    site-packages (hermes-service.ts) calls this only for Worldlet's own profile (`profile`), so another profile run on
    the same runtime keeps its own model."""
    from hermes_constants import get_hermes_home
    if Path(get_hermes_home()).resolve() == Path(profile).resolve():
        borrow_codex()


def main():
    borrow_codex()
    from hermes_cli.main import main as hermes
    return hermes()


if __name__ == "__main__":
    sys.exit(main())
