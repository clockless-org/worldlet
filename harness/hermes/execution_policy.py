"""Budgets for Worldlet-owned Hermes profiles; Hermes owns the execution loop."""
CHAT_MAX_TURNS = 90
CHAT_DEADLINE_SECONDS = 600


def configure_owned_budget(config):
    """Migrate the old Worldlet default, preserving other user-selected limits.

    Call only for app-owned profiles. External Hermes configuration is never saved.
    """
    agent = config.setdefault("agent", {})
    if agent.get("max_turns") not in (None, 20):
        return False
    agent["max_turns"] = CHAT_MAX_TURNS
    return True
