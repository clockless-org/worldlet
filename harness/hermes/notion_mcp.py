"""Bounded, read-only Notion browsing through Hermes' authenticated MCP client."""
import asyncio
import html
import json
import re
from urllib.parse import urlparse

MAX_TEXT = 160_000


def readable_mentions(text):
    def date(match):
        values = dict(re.findall(r'(start|startTime)="([^"]+)"', match.group()))
        return " ".join(values[key] for key in ("start", "startTime") if key in values)
    return re.sub(r'<mention-date\b[^>]*?/?>', date, text)


def display_text(text):
    return html.unescape(re.sub(r'<[^>]+>', '', readable_mentions(str(text)))).replace('**', '').replace('__', '').strip()


def page_id(value):
    value = str(value).strip()
    if not re.fullmatch(r"[a-fA-F0-9-]{32,36}", value):
        url = urlparse(value)
        host = (url.hostname or "").lower()
        if url.scheme != "https" or url.username or url.password or not any(host == domain or host.endswith("." + domain) for domain in ("notion.so", "notion.com", "notion.site")):
            raise ValueError("Enter a Notion page URL or ID.")
        value = url.path
    ids = re.findall(r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|[a-fA-F0-9]{32}", value)
    if not ids:
        raise ValueError("Enter a Notion page URL or ID.")
    return ids[-1].replace("-", "").lower()


def payload(result):
    if getattr(result, "is_error", getattr(result, "isError", True)):
        raise RuntimeError("Notion could not read this content. Check page access and try again.")
    for item in result.content:
        text = getattr(item, "text", "")
        if text:
            try:
                value = json.loads(text)
            except (ValueError, TypeError):
                continue
            if isinstance(value, dict):
                return value
    raise RuntimeError("Notion returned an unsupported content format.")


def index_result(value):
    rows = value.get("results")
    if not isinstance(rows, list):
        raise RuntimeError("Notion did not return a page list.")
    pages, seen = [], set()
    for row in rows[:20]:
        try:
            identifier = page_id(row.get("url", row.get("id", "")))
        except ValueError:
            continue
        if identifier in seen:
            continue
        seen.add(identifier)
        pages.append({"id": identifier, "title": display_text(row.get("title") or "Untitled")[:500],
                      "url": "https://www.notion.so/" + identifier, "type": row.get("type", "page")})
    return {"ok": True, "pages": pages, "hasMore": bool(value.get("nextCursor")), "scope": "Up to 20 recently visited pages"}


def page_result(value, identifier):
    text = value.get("text")
    if not isinstance(text, str):
        raise RuntimeError("Notion did not return the page body.")
    kind = value.get("metadata", {}).get("type", "page")
    match = re.search(r"<content>([\s\S]*)</content>", text)
    # Notion uses a distinct body marker for a successfully fetched blank page.
    # Missing body data (e.g. an index/title) must still fail instead of replacing
    # an existing original with an empty document.
    blank = re.search(r"<blank-page>[^<]*</blank-page>", text) is not None
    if kind == "page" and not match and not blank:
        raise RuntimeError("Notion did not return a readable page body. Open it in Notion.")
    markdown = readable_mentions(match.group(1).strip()) if match else ""
    # Keep page links readable in Notion's enhanced Markdown without executing HTML.
    markdown = re.sub(r'<(?:page|mention-page)\b[^>]*url="([^"]+)"[^>]*>(.*?)</(?:page|mention-page)>', r'[\2](\1)', markdown, flags=re.S)
    markdown = re.sub(r'<mention-page\b[^>]*url="([^"]+)"[^>]*/>', r'[Linked page](\1)', markdown)
    partial = bool(value.get("truncated") or value.get("unknown_block_count") or len(markdown) > MAX_TEXT or re.search(r'truncated="true"|<unknown\b', text))
    return {"id": identifier, "title": display_text(value.get("title") or "Untitled")[:500],
            "url": "https://www.notion.so/" + identifier, "object_type": "page",
            "markdown": markdown[:MAX_TEXT], "partial": partial,
            "kind": kind, "lastEdited": value.get("page_last_edited_at", "")}


async def database_rows(session, value, page):
    text = value.get("text", "")
    tags = re.findall(r'<data-source\b[^>]*>', text)
    sources = [match.group() for tag in tags if (match := re.search(r'collection://[a-f0-9-]{32,36}', tag))]
    if not sources:
        page["notice"] = "This database has no readable collection. Open it in Notion."
        page["partial"] = True
        return
    result = payload(await session.call_tool("notion-query-data-sources", {"data": {"mode": "rows", "data_source_url": sources[0], "limit": 20}}, read_timeout_seconds=45))
    rows = result.get("results")
    if not isinstance(rows, list):
        raise RuntimeError("Notion did not return database items.")
    schema = {}
    state = re.search(r'<data-source-state>([\s\S]*?)</data-source-state>', text)
    if state:
        try:
            schema = json.loads(state.group(1)).get("schema", {})
        except ValueError:
            pass
    title_key = next((key for key, prop in schema.items() if prop.get("type") == "title"), "Name")
    columns = [key for key, prop in schema.items() if key != title_key and prop.get("type") in {"status", "select", "number", "checkbox"}][:4]

    def plain(value):
        if isinstance(value, list):
            return ", ".join(plain(item) for item in value)[:2000]
        if isinstance(value, dict):
            return str(value.get("plain_text") or value.get("name") or (value.get("text") or {}).get("content") or "")[:2000]
        return display_text(value if value is not None else "")[:2000]

    items = []
    for row in rows[:20]:
        try:
            identifier = page_id(row.get("url", ""))
        except ValueError:
            continue
        items.append({"id": identifier, "title": plain(row.get(title_key) or row.get("title") or "Untitled"),
                      "values": [plain(row.get(column)) for column in columns]})
    # A bounded database preview is evidence of these rows, never the whole database.
    # Preserve incomplete coverage through source_reader and Attention synthesis.
    more = bool(result.get("has_more")) or len(sources)>1 or len(rows)>=20
    page.update(rows=items, columns=columns, more=more,
                partial=bool(page.get("partial")) or more or len(items)!=len(rows))
    page["notice"] = "Showing up to 20 items" + (" from the first collection. Open in Notion for more." if len(sources)>1 else ".")
    def cell(value):
        return value.replace("|", "\\|").replace("\n", " ")
    page["markdown"] = page["notice"] + "\n\n| Title | " + " | ".join(map(cell, columns)) + " |\n| --- | " + " | ".join("---" for _ in columns) + " |\n" + "\n".join("| " + " | ".join(cell(v) for v in [row["title"], *row["values"]]) + " |" for row in items)


async def read_session(session, operation, identifier=None):
    if operation == "list":
        return index_result(payload(await session.call_tool("notion-list-recent-pages", {"limit": 20}, read_timeout_seconds=45)))
    if operation == "fetch":
        identifier = page_id(identifier)
        value = payload(await session.call_tool("notion-fetch", {"id": identifier}, read_timeout_seconds=45))
        data = page_result(value, identifier)
        if data["kind"] in {"database", "data_source"}:
            await database_rows(session, value, data)
        return {"ok": True, "page": data, "records": [{"id": identifier, "data": data}]}
    raise ValueError("Unsupported Notion operation.")


def read(body):
    from mcp_session import connected_session
    session, run = connected_session("notion", ("https://mcp.notion.com/mcp",), "Connect Notion with Fox before opening this shelf.",
                                     "This shelf requires the official Notion MCP connection.", "Notion is disconnected. Ask Fox to retry the connection.")
    if body.get("operation") in {"prepare", "commit", "check", "reviews", "discard"}:
        from notion_writes import handle
        import os
        from pathlib import Path
        return run(lambda: handle(session, body, Path(os.environ["HERMES_HOME"])), timeout=135)
    return run(lambda: read_session(session, body.get("operation"), body.get("id")), timeout=135)
