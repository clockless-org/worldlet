"""One backend read path for chat and checks. No model runs in the connector worker."""
import base64
import html
import re
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def normalize(provider, result):
    rows = result.get("records", result.get("pages"))
    if result.get("error") or result.get("ok") is False or not isinstance(rows, list):
        raise ValueError("Source did not return valid records.")
    def strings(value):
        if isinstance(value, str): return value
        if isinstance(value, list): return "\n".join(map(strings, value))
        if isinstance(value, dict): return "\n".join(strings(value[k]) for k in sorted(value))
        return ""
    def mail(part):
        if part.get("mimeType") == "text/plain" or not part.get("parts"):
            raw = (part.get("body") or {}).get("data", "")
            return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8", errors="replace") if raw else ""
        plain = [p for p in part.get("parts", []) if p.get("mimeType") != "text/html"]
        return "\n".join(mail(p) for p in plain) if plain else html.unescape(re.sub(r"<[^>]+>", " ", "\n".join(mail(p) for p in part.get("parts", []))))
    records = []
    for row in rows[:50]:
        data = row.get("data", row)
        identifier = row.get("id")
        if not isinstance(identifier, str) or not identifier:
            raise ValueError("Missing source identity.")
        title = data.get("title", data.get("summary", provider))
        url = data.get("htmlLink", data.get("url", ""))
        text = strings(data)
        metadata = {"metadataOnly": bool(result.get("metadataOnly"))}
        if provider == "google-calendar":
            # Never flatten calendar fields: alphabetical order puts end before start.
            # Keep provider timestamps authoritative, including their UTC offsets.
            start, end = data.get("start", {}), data.get("end", {})
            metadata.update({"start": start.get("dateTime", start.get("date", "")),
                             "end": end.get("dateTime", end.get("date", "")),
                             "allDay": "date" in start, "cancelled": data.get("status") == "cancelled" or any(a.get("self") and a.get("responseStatus")=="declined" for a in data.get("attendees", []))})
            text = "\n".join(["Title: " + str(title), "Start: " + metadata["start"],
                              "End: " + metadata["end"],
                              "Time zone: " + start.get("timeZone", ""),
                              "Status: " + data.get("status", ""),
                              "Location: " + data.get("location", ""),
                              "Your response: " + next((a.get("responseStatus", "") for a in data.get("attendees", []) if a.get("self")), ""),
                              "Description: " + data.get("description", "")])
        if provider == "notion":
            # An index's title/URL is discovery metadata, not the fetched page body.
            original = data.get("markdown")
            text = original if isinstance(original, str) else ""
            metadata = {"metadataOnly": not isinstance(original, str), "partial": bool(data.get("partial")) or len(text) > 12000}
        if provider == "gmail":
            messages = data.get("thread", {}).get("messages", [data])
            # The user's own workflow (#1152): a thread with any message in the inbox is kept
            # there; one whose observed messages are all outside it is archived. No labels, no placement.
            labelled = [m for m in messages if isinstance(m.get("labelIds"), list)]
            placement = ("inbox" if any("INBOX" in m["labelIds"] for m in labelled) else "archived") if labelled else None
            if result.get("unreadOnly"): messages = [m for m in messages if "UNREAD" in m.get("labelIds", [])]
            messages = sorted(messages, key=lambda msg: int(msg.get("internalDate", 0)), reverse=True)
            thread_id = data.get("thread", {}).get("id") or data.get("threadId") or identifier.removeprefix("thread:")
            identifier = "thread:" + thread_id
            metadata = {**metadata, "labelIds": sorted({label for m in messages for label in m.get("labelIds", []) if label in {"CATEGORY_PROMOTIONS", "SPAM"}}), "threadId": thread_id, "messageCount": len(messages), "unread": any("UNREAD" in m.get("labelIds", []) for m in messages), "receivedAt": max((int(m.get("internalDate", 0)) for m in messages), default=0)}
            if placement: metadata["mailPlacement"] = placement
            metadata["allMessagesExcluded"] = bool(messages) and all(set(m.get("labelIds", [])) & {"SPAM", "TRASH"} for m in messages)
            segments = []
            for i, message in enumerate(messages[:8]):
                payload = message.get("payload", {})
                headers = {h.get("name", "").lower(): h.get("value", "") for h in payload.get("headers", [])}
                if i == 0:
                    title = headers.get("subject", "No subject")
                    metadata.update({"from": headers.get("from", ""), "date": headers.get("date", "")})
                direction = "SENT BY USER" if "SENT" in message.get("labelIds", []) else "RECEIVED"
                body = mail(payload) or html.unescape(message.get("snippet", ""))
                segments.append("\n".join([direction, "Status: " + ("UNREAD" if "UNREAD" in message.get("labelIds", []) else "READ"), "Date: "+headers.get("date", ""), "From: "+headers.get("from", ""), "Subject: "+headers.get("subject", ""), body[:12000]]))
            # The newest received message's own picture, if it has one (gmail_reader.content_image).
            picture = next((m["picture"] for m in messages if isinstance(m.get("picture"), dict) and "SENT" not in m.get("labelIds", [])), None)
            if picture and isinstance(picture.get("src"), str): metadata["image"] = picture["src"]
            metadata["partial"] = bool(data.get("thread", {}).get("messagesOmitted")) or len(messages)>8 or any(m.get("excerptTruncated") for m in messages)
            text = "Thread, newest first. User: " + data.get("userEmail", "") + "\n\n" + "\n\n---\n\n".join(segments)
            url = "https://mail.google.com/mail/u/0/#all/" + thread_id
        if len(text)>12000: metadata["partial"]=True
        records.append({"provider": provider, "id": identifier, "title": title, "url": url, "text": text[:12000], **metadata})
    return records


def source_failure(events):
    # Only classified codes cross this boundary, never raw provider bodies/URLs.
    code = next((e.get("code") for e in events if e.get("type") == "error"), None)
    return {
        "source_not_found": "This source record was not found. Use the provider record ID from the saved item's sources, not its Worldlet item ID. Query the item or list recent mail to recover the correct source.",
        "invalid_request": "The source request is invalid. Check the provider source ID and arguments; do not use a Worldlet attention item ID.",
        "authorization_required": "Source authorization expired. Reconnect the account with Fox.",
        "access_denied": "The source denied access. Check the connected account's permissions.",
        "rate_limited": "The source is limiting requests. Wait before retrying.",
    }.get(code, "The source is temporarily unavailable. Retry the read.")


def read(args, home, cancelled):
    if cancelled.is_set():
        raise RuntimeError("Source read was cancelled.")
    provider = args["provider"]
    if provider not in {"gmail", "google-calendar", "notion"}:
        raise ValueError("Unsupported backend source.")
    if provider != "gmail" and (args.get("unreadOnly") or (args.get("pageToken") and provider != "google-calendar") or args.get("query") or args.get("metadataOnly") or args.get("discovery")):
        raise ValueError("Unread filtering and paging are available for Gmail only.")
    body = ({"action": "notion", "operation": "fetch" if args.get("id") else "list", "id": args.get("id", "")} if provider == "notion"
            else {"action": "google", "operation": "read", "service": provider, "threads":provider=="gmail", "limit":args.get("limit",20), "id":args.get("id", ""), "unreadOnly":args.get("unreadOnly", False), "pageToken":args.get("pageToken", ""), "query":args.get("query", ""), "metadataOnly":args.get("metadataOnly",False), "discovery":args.get("discovery",False), "scanMessages":args.get("scanMessages",False), "windowStart":args.get("windowStart"), "windowDays":args.get("windowDays",30)})
    env = dict(os.environ, HERMES_HOME=str(home), WORLDLET_PARENT_PID=str(os.getpid()))
    env.pop("WORLDLET_MODEL_HOME", None)
    # A short-lived connector process isolates upstream profile globals. It invokes
    # the existing adapter only: no agent, conversation or model invocation.
    process = subprocess.Popen([sys.executable, str(Path(__file__).with_name("host.py"))],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    pending = json.dumps(body) + "\n"
    deadline = time.monotonic() + 150
    try:
        while not cancelled.is_set() and time.monotonic() < deadline:
            try:
                output, _ = process.communicate(pending, timeout=.1)
                events = [json.loads(line) for line in output.splitlines() if line.strip()]
                result = next((e["value"] for e in events if e.get("type") == "result"), None)
                if process.returncode or result is None:
                    raise RuntimeError(source_failure(events))
                return {"scannedCount":result.get("scannedCount",len(result.get("records",[]))), "records": normalize(provider, result), "scope": result.get("scope", "Bounded results, not the entire account."), "nextPageToken": result.get("nextPageToken", ""), "unreadOnly": result.get("unreadOnly", False), "metadataOnly":result.get("metadataOnly",False),"coverage":result.get("coverage",[])}
            except subprocess.TimeoutExpired:
                pending = None
        raise RuntimeError("Source read was cancelled or timed out.")
    finally:
        if process.poll() is None: process.kill()
        process.wait()


def execute(args, native, home, cancelled, reader=read):
    def call(name, values):
        result = json.loads(native(name, values))
        if result.get("error"): raise RuntimeError(result["error"])
        return result
    permit = call("_source_begin", args)
    try:
        page = {"records": permit.get("records"), "scope": "Bounded local results."} if "records" in permit else reader(permit.get("readOptions", args), home, cancelled)
        if isinstance(page, list): page = {"records": page, "scope": "Bounded results, not the entire account."}
        records = page["records"]
        call("_source_result", {"provider": args["provider"], "ticket": permit["ticket"], "records": records, "scope": page.get("scope", "")})
        return json.dumps(page, ensure_ascii=False)
    except Exception:
        if not cancelled.is_set():
            call("_source_result", {"provider": args["provider"], "ticket": permit["ticket"], "failed": True})
        raise
