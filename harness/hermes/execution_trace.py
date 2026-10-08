"""Bounded optional trace frames; the host owns sanitization and durable storage."""
import json


def trace(emit, request_id, kind, payload):
    try:
        encoded = json.dumps(payload, ensure_ascii=False)
        if len(encoded.encode('utf-8')) > 128_000:
            payload = {"omitted": "wire_size_limit", "bytes": len(encoded.encode('utf-8'))}
        emit("trace", request_id=request_id, kind=kind, payload=payload)
    except (TypeError, ValueError):
        emit("trace", request_id=request_id, kind=kind, payload={"omitted": "non_json_payload"})
