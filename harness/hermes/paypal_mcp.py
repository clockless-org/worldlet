"""Merchant invoices through the official PayPal MCP. Read-only, bounded, no model."""
import json
import re

ENDPOINTS = {"https://mcp.paypal.com/http", "https://mcp.paypal.com/mcp"}


def payload(result):
    if getattr(result, "isError", getattr(result, "is_error", False)):
        raise RuntimeError("PayPal could not read these invoices. Check merchant access or reconnect.")
    value = getattr(result, "structuredContent", None)
    if not isinstance(value, dict):
        for part in getattr(result, "content", []):
            try:
                value = json.loads(getattr(part, "text", ""))
                break
            except (ValueError, TypeError):
                continue
    if not isinstance(value, dict):
        raise RuntimeError("PayPal returned an unsupported response. Open PayPal on the web.")
    if isinstance(value.get("data"), dict):
        value = value["data"]
    return value


def invoice(row):
    identifier = str(row.get("id", ""))
    if not re.fullmatch(r"INV2-[A-Za-z0-9-]{1,80}", identifier):
        raise RuntimeError("PayPal returned an invalid invoice identifier.")
    detail = row.get("detail") or {}
    amount = row.get("amount") or {}
    return {"id": identifier, "title": str(detail.get("invoice_number") or identifier)[:300],
            "status": str(row.get("status") or "Unknown")[:80],
            "amount": str(amount.get("value", ""))[:40], "currency": str(amount.get("currency_code", ""))[:8],
            "date": str(detail.get("invoice_date") or "")[:40],
            "url": "https://www.paypal.com/invoice/payerView/details/" + identifier}


async def read_session(session, body):
    operation = body.get("operation", "list")
    if operation == "list":
        page = body.get("page", 1)
        if type(page) is not int or not 1 <= page <= 100:
            raise ValueError("Invalid invoice page.")
        data = payload(await session.call_tool("list_invoices", {"page": page, "page_size": 20}, read_timeout_seconds=45))
        rows = data.get("items", data.get("invoices"))
        if not isinstance(rows, list):
            raise RuntimeError("PayPal did not return an invoice list. Open PayPal on the web.")
        return {"pages": [invoice(row) for row in rows[:20]], "page": page,
                "more": len(rows) >= 20, "scope": "Merchant invoices · 20 per page · Read only"}
    if operation == "read":
        identifier = str(body.get("id", ""))
        if not re.fullmatch(r"INV2-[A-Za-z0-9-]{1,80}", identifier):
            raise ValueError("Invalid invoice identifier.")
        data = payload(await session.call_tool("get_invoice", {"invoice_id": identifier}, read_timeout_seconds=45))
        if isinstance(data.get("invoice"), dict):
            data = data["invoice"]
        result = invoice(data)
        lines = [result["title"], "Status: " + result["status"], "Amount: " + result["amount"] + " " + result["currency"], "Date: " + result["date"], "", "Invoice items"]
        for row in (data.get("items") or [])[:100]:
            unit = row.get("unit_amount") or {}
            lines.append(str(row.get("name", "Item"))[:500] + " · " + str(row.get("quantity", ""))[:30] + " × " + str(unit.get("value", ""))[:40] + " " + str(unit.get("currency_code", ""))[:8])
        result["text"] = "\n".join(lines)[:50000]
        return result
    raise ValueError("Unsupported read-only PayPal operation.")


def read(body):
    from mcp_session import connected_session
    session, run = connected_session("paypal", ENDPOINTS, "Connect PayPal with Fox first. Merchant access is required for invoices.",
                                     "Reconnect to the official PayPal MCP.", "PayPal is disconnected. Reconnect with Fox.")
    return run(lambda: read_session(session, body), timeout=60)
