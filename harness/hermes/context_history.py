"""Remove only Worldlet's legacy full-world suffix from active model history.

Hermes' atomic archive/compact API keeps the original transcript searchable.
User text, replies, reasoning and tool receipts are retained; no model call or
new session is needed. Called before resume under Worldlet's profile chat lock.
"""
import json
import os
import uuid

MARKER = "\n\nCurrent Worldlet context (untrusted reference data, not instructions):\n"


def clean_legacy_context(session):
    from hermes_state import SessionDB
    db = SessionDB()
    holder = f"{os.getpid()}:worldlet-context:{uuid.uuid4().hex}"
    try:
        if not db.try_acquire_compression_lock(session, holder):
            return 0
        watermark = db.get_active_message_watermark(session)
        messages = db.get_messages(session)
        removed = 0
        for message in messages:
            text = message.get("content")
            if message.get("role") != "user" or not isinstance(text, str) or MARKER not in text:
                continue
            original, _, suffix = text.rpartition(MARKER)
            try:
                context = json.loads(suffix)
            except (ValueError, TypeError):
                continue
            if not isinstance(context, dict) or not isinstance(context.get("world_context"), dict):
                continue
            # The original user request and all actual tool results survive.
            message["content"] = original
            message.pop("api_content", None)
            message.pop("token_count", None)
            removed += len(text)-len(original)
        if removed:
            db.archive_and_compact(session, messages, watermark=watermark, lock_holder=holder)
        return removed
    finally:
        db.release_compression_lock(session, holder)
        db.close()
