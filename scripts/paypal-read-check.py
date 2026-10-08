"""Read allowlist, response contract and failure handling, without account access."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))
from paypal_mcp import read_session, payload

class Session:
    def __init__(self): self.calls=[]
    async def call_tool(self,name,args,**kw):
        self.calls.append((name,args))
        row={'id':'INV2-TEST-123','detail':{'invoice_number':'42','invoice_date':'2026-09-18'},'status':'SENT','amount':{'value':'12.34','currency_code':'USD'},'items':[{'name':'Service','quantity':'1','unit_amount':{'value':'12.34','currency_code':'USD'}}]}
        return NS(isError=False,structuredContent={'items':[row]} if name=='list_invoices' else row)
async def run():
    s=Session()
    result=await read_session(s,{'operation':'list','page':2})
    assert result['pages'][0]['amount']=='12.34'
    assert s.calls[0]==('list_invoices',{'page':2,'page_size':20})
    result=await read_session(s,{'operation':'read','id':'INV2-TEST-123'})
    assert 'Service' in result['text'] and '12.34 USD' in result['text']
    for request in [{'operation':'send_invoice'},{'operation':'list','page':0},{'operation':'list','page':True},{'operation':'read','id':'https://evil.test'}]:
        before=len(s.calls)
        try: await read_session(s,request)
        except ValueError: pass
        else: raise AssertionError('Unsafe request was accepted')
        assert len(s.calls)==before
    for result in [NS(isError=True),NS(isError=False,content=[])]:
        try: payload(result)
        except RuntimeError: pass
        else: raise AssertionError('Invalid response appeared empty')
    print('PASS PayPal merchant invoices: fixed reads, pagination, decimal amounts, invalid IDs and failure handling.')
asyncio.run(run())
