"""Offline Gmail send boundary checks; no account access or external writes."""
import base64
import json
import os
from email import message_from_bytes
import importlib.util
from pathlib import Path
import tempfile
import uuid
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))

spec=importlib.util.spec_from_file_location('mail_actions',Path(__file__).resolve().parents[1]/'harness/hermes/mail_actions.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class API:
    sent=[];fail=False;account="me@example.com";found=False;mismatch=False
    def users(self):return self
    def messages(self):self.threading=False;return self
    def threads(self):self.threading=True;return self
    def getProfile(self,**kw):self.kind='profile';return self
    def get(self,**kw):self.kind='thread' if self.threading else 'metadata';return self
    def list(self,**kw):self.kind='list';self.query=kw;return self
    def send(self,**kw):self.kind='send';self.sent.append(kw['body']);return self
    def execute(self,**kw):
        if self.kind=='profile':return {'emailAddress':self.account}
        if self.kind=='thread':return {'messages':[{'internalDate':'1','payload':{'headers':[{'name':'From','value':'Alex <alex@example.com>'},{'name':'Subject','value':'Trip'},{'name':'Message-ID','value':'<one@example.com>'}]}}]}
        if self.kind=='list':return {'messages':[{'id':'found-one'}]} if self.found else {}
        if self.kind=='metadata':
            msg=message_from_bytes(base64.urlsafe_b64decode(self.sent[-1]['raw']))
            return {'id':'found-one','threadId':'ab12','labelIds':['SENT'],'payload':{'headers':[{'name':k,'value':str(msg[k]) if not (self.mismatch and k=='Message-ID') else '<other@example.com>'} for k in ['Message-ID','From','To']]}}
        if self.fail:raise TimeoutError('unknown delivery')
        return {'id':'sent-one','threadId':'ab12'}
api=API()
draft=m.prepare(api,{'threadId':'thread:ab12','subject':'Re: Trip','body':'The plan is attached as text.'})
assert draft['to']=='alex@example.com' and draft['threadId']=='ab12'
try:m.prepare(api,{'threadId':'cd34','sourceIds':['thread:ab12'],'subject':'Re: Trip','body':'Wrong thread.'})
except ValueError as error:assert 'sourceIds' in str(error)
else:raise AssertionError('reply thread outside the cited sources accepted')
assert m.prepare(api,{'threadId':'ab12','sourceIds':['thread:ab12'],'subject':'Re: Trip','body':'Cited thread.'})['threadId']=='ab12'
# #1623: one person's reply never gets another email's recipient and subject.
for wrong,why in [({'body':'Hi Priya,\n\nThe roadmap comes Thursday.'},'greets Priya'),({'to':'priya@example.com','body':'The roadmap comes Thursday.'},'not part of thread')]:
    try:m.prepare(api,{'threadId':'ab12','subject':'Re: Q4 roadmap',**wrong})
    except ValueError as error:assert why in str(error),error
    else:raise AssertionError('reply paired with another thread\'s header: '+why)
for right in [{'body':'Hi Alex, see you there.'},{'body':'Hello there, see you.'},{'body':'Dear Dr. Alex, thanks.'},{'to':'alex@example.com','body':'Hi Al, thanks.'}]:
    assert m.prepare(api,{'threadId':'ab12','subject':'Re: Trip',**right})['to']=='alex@example.com',right
assert m.greeted('Hi Priya,\nThanks')=='Priya' and m.greeted('Hey, Sam!')=='Sam' and m.greeted('Hi there,')=='' and m.greeted('Thanks Priya')==''
for bad in ['alex@example.com\nBcc: x@example.com','Alex','one@example.com,two@example.com']:
    try:m.address(bad)
    except ValueError:pass
    else:raise AssertionError('invalid recipient accepted')
with tempfile.TemporaryDirectory() as home:
    identifier=str(uuid.uuid4()).upper();receipt=m.send(api,home,draft,identifier)
    assert m.send(api,home,draft,identifier.lower())==receipt and len(api.sent)==1, 'UUID case must share the receipt'
    msg=message_from_bytes(base64.urlsafe_b64decode(api.sent[0]['raw']))
    assert msg['In-Reply-To']=='<one@example.com>' and api.sent[0]['threadId']=='ab12'
    api.account='other@example.com'
    try:m.send(api,home,draft,identifier)
    except RuntimeError:pass
    else:raise AssertionError('Cached receipt accepted for changed account')
    api.account='me@example.com'
    api.fail=True;identifier=str(uuid.uuid4())
    try:m.send(api,home,draft,identifier)
    except TimeoutError:pass
    try:m.send(api,home,draft,identifier)
    except RuntimeError:pass
    else:raise AssertionError('uncertain send retried')
    assert len(api.sent)==2
    path=Path(home)/'mail-receipts'/(identifier+'.json')
    pending=json.loads(path.read_text())
    assert pending['rfcMessageId'] and pending['draftHash'] and pending['status']=='sending'
    assert os.name=='nt' or path.stat().st_mode & 0o777 == 0o600  # Windows has no POSIX mode bits
    assert draft['body'] not in path.read_text(), 'Receipt must not duplicate email content'
    assert m.reconcile(api,home,draft,identifier)['status']=='unknown'
    assert api.query['labelIds']==['SENT'] and api.query['q']=='rfc822msgid:'+pending['rfcMessageId']
    api.found=True;api.mismatch=True
    assert m.reconcile(api,home,draft,identifier)['status']=='unknown', 'Search result alone is insufficient'
    api.mismatch=False;api.account='other@example.com'
    try:m.reconcile(api,home,draft,identifier)
    except RuntimeError:pass
    else:raise AssertionError('Wrong account accepted')
    api.account='me@example.com'
    assert m.reconcile(api,home,{**draft,'body':'different'},identifier)['status']=='unknown'
    recovered=m.reconcile(api,home,draft,identifier)
    assert recovered['status']=='sent' and recovered['messageId']=='found-one'
    assert m.send(api,home,draft,identifier)==recovered and len(api.sent)==2, 'Recovery must never resend'
    legacy=str(uuid.uuid4());(Path(home)/'mail-receipts'/(legacy+'.json')).write_text('{"status":"sending"}')
    assert m.reconcile(api,home,draft,legacy)['reason']=='unmatched_receipt'
    assert m.reconcile(api,home,draft,str(uuid.uuid4()))['reason']=='no_receipt'
print('PASS mail review, reply headers, recipient validation, duplicate protection, read-only uncertain-send reconciliation, account/content binding and legacy receipts')
