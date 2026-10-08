"""Notion index/body evidence boundary; no account, model or network."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "harness/hermes"))
from source_reader import normalize

identifier = "a" * 32
index = normalize("notion", {"pages": [{"id": identifier, "title": "Pay this invoice", "url": "https://www.notion.so/" + identifier}]})[0]
assert index["metadataOnly"] and index["text"] == "" and index["title"] == "Pay this invoice"

def page(markdown, **extra):
    return normalize("notion", {"records": [{"id": identifier, "data": {"markdown": markdown, "title": "Unrelated metadata", "url": "https://www.notion.so/" + identifier, **extra}}]})[0]

body = page("The report is finished.")
assert body["text"] == "The report is finished." and not body["metadataOnly"] and not body["partial"]
assert page("")["text"] == "" and not page("")["metadataOnly"]
long = page("🌍" * 12001)
assert long["text"] == "🌍" * 12000 and long["partial"]
assert page("Available block", partial=True)["partial"]
print("PASS Notion evidence: index metadata cannot ground items; only original Markdown is evidence; empty and truncated Unicode bodies remain explicit.")

# Database previews must keep truncation/coverage metadata all the way to source evidence.
import asyncio
import json
from types import SimpleNamespace
from notion_mcp import database_rows
class Session:
    def __init__(self, rows, more=False): self.rows, self.more = rows, more
    async def call_tool(self, *args, **kwargs):
        return SimpleNamespace(is_error=False, content=[SimpleNamespace(text=json.dumps({'results':self.rows,'has_more':self.more}))])
async def check_databases():
    markup='<data-source url="collection://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa">'
    rows=[{'url':'https://www.notion.so/'+format(i+1,'032x'),'Name':'Record '+str(i)} for i in range(20)]
    for session, text in [(Session(rows),markup),(Session(rows[:1],True),markup),(Session(rows[:1]),markup+markup),(Session([{'url':'invalid'}]),markup)]:
        data={'partial':False}
        await database_rows(session,{'text':text},data)
        assert data['partial'], 'Incomplete database coverage must not appear complete'
        record=normalize('notion',{'records':[{'id':identifier,'data':{'title':'Database',**data}}]})[0]
        assert record['partial'], 'Reader dropped database coverage metadata'
    data={'partial':False}
    await database_rows(Session(rows[:1]),{'text':markup},data)
    assert not data['partial'] and len(data['rows'])==1
    missing={}
    await database_rows(Session([]),{'text':''},missing)
    assert missing['partial'], 'Unreadable database cannot be presented as complete'
asyncio.run(check_databases())
print('PASS database evidence: row cap, next-page flag, multiple collections, skipped rows and unreadable collection retain partial coverage')
