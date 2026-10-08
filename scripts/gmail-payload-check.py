"""Offline regression for the Gmail response that exceeded the native 2 MB cap."""
import base64,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))
from gmail_reader import read_page,compact_message
encode=lambda s:base64.urlsafe_b64encode(s.encode()).decode()
message={'id':'abc','threadId':'abc','internalDate':'123','labelIds':['UNREAD'],'payload':{'mimeType':'multipart/mixed','headers':[{'name':'Subject','value':'A real subject'},{'name':'From','value':'Alice <alice@example.test>'},{'name':'Date','value':'Wed, 23 Sep 2026 10:32:00 +0000'}],'parts':[{'mimeType':'text/html','body':{'data':encode('<style>'+('x'*3000000)+'</style><p>Hello</p><a href="https://example.test/event">Event</a>')}},{'mimeType':'image/png','filename':'photo.png','body':{'data':'x'*3000000,'size':3000000}}]}}
compact=compact_message(message)
text=base64.urlsafe_b64decode(compact['payload']['body']['data']).decode()
assert 'Hello' in text and 'https://example.test/event' in text and '<style>' not in text
assert compact['payload']['parts'][0]['filename']=='photo.png'
assert len(json.dumps(compact))<10000
malformed={**message,'payload':{'mimeType':'text/html','body':{'data':encode('<p>Hello <a href>unfinished link</a>. <a href="https://example.test">Valid link</a></p>')}}}
malformed_text=base64.urlsafe_b64decode(compact_message(malformed)['payload']['body']['data']).decode()
assert 'unfinished link' in malformed_text and '[Valid link](<https://example.test>)' in malformed_text
large={**message,'payload':{'mimeType':'text/plain','body':{'data':encode('中文邮件'*100000)},'headers':[{'name':'Subject','value':'邮件'*1000}]*12}}
assert compact_message(large)['excerptTruncated']
class Result:
 def __init__(self,value):self.value=value
 def execute(self):return self.value
class Batch:
 """Fake Gmail batch: completes sub-requests out of order, like the real endpoint may."""
 def __init__(self,api,callback):self.api,self.callback,self.items=api,callback,[]
 def add(self,request,request_id):self.items.append((request_id,request))
 def execute(self):
  self.api.batches=getattr(self.api,'batches',[])+[len(self.items)]
  for request_id,request in reversed(self.items):self.callback(request_id,request.execute(),None)
class API:
 def new_batch_http_request(self,callback):return Batch(self,callback)
 def users(self):return self
 def messages(self):return self
 def threads(self):return self
 def list(self,**kw):return Result({'messages':[{'id':'abc'}]*kw['maxResults'],'threads':[{'id':'abc'}]*kw['maxResults'],'nextPageToken':'next'})
 def get(self,**kw):return Result({**large,'messages':[large]*100})
for threads in (False,True):
 api=API();page=read_page(api,{'threads':threads},'user@example.test')
 assert api.batches==[20],'one Gmail batch round trip per page'
 assert len(json.dumps({'type':'result','value':page}).encode())<1900000
 assert len(page['records'])==20 and page['nextPageToken']=='next'
 if threads:assert page['records'][0]['data']['thread']['messagesOmitted']==92
print('PASS large HTML, inline attachments, Unicode excerpts, 20-message/long-thread response bounds and paging')

assert len(read_page(API(),{"threads":True,"limit":5},"user@example.test")["records"])==5
for limit in (0,21,True,"5"):
 try:read_page(API(),{"limit":limit},"user@example.test")
 except ValueError:pass
 else:raise AssertionError("invalid limit accepted")
print("PASS five-thread onboarding limit and validation")

from source_reader import normalize
categorized=normalize('gmail',{'records':[{'id':'abc','data':{**compact,'labelIds':['UNREAD','CATEGORY_PROMOTIONS','private-user-label']}}]})
assert categorized[0]['labelIds']==['CATEGORY_PROMOTIONS']
assert categorized[0]['from']=='Alice <alice@example.test>'
assert categorized[0]['date']=='Wed, 23 Sep 2026 10:32:00 +0000'
assert categorized[0]['receivedAt']==123
print('PASS provider categories retained without leaking custom label names')
assert categorized[0]['mailPlacement']=='archived' and categorized[0]['unread']
kept=normalize('gmail',{'records':[{'id':'t','data':{'thread':{'id':'t','messages':[{**compact,'labelIds':['SENT']},{**compact,'labelIds':['INBOX']}]}}}]})[0]
assert kept['mailPlacement']=='inbox' and not kept['unread']
assert 'mailPlacement' not in normalize('gmail',{'records':[{'id':'u','data':{k:v for k,v in compact.items() if k!='labelIds'}}]})[0]
print('PASS thread placement: any inbox message keeps it in the inbox; unlabelled placement stays unknown')

from source_reader import source_failure
assert "provider record ID" in source_failure([{"type":"error","code":"source_not_found","message":"private provider response"}])
assert "authorization expired" in source_failure([{"type":"error","code":"authorization_required"}])
assert "private" not in source_failure([{"type":"error","message":"private provider response"}])
assert "authorization" not in source_failure([{"type":"error","code":"source_unavailable"}])
print("PASS source failures distinguish identity, authorization and transient errors without exposing provider bodies")

# Metadata discovery is bounded, deduplicated, and never substitutes for a body read.
from gmail_reader import discover
class SearchAPI(API):
 def __init__(self):self.searches=[];self.fetches=[]
 def list(self,**kw):
  self.searches.append(kw)
  return Result({'threads':[{'id':'abc'},{'id':format(len(self.searches),'x')}], 'nextPageToken':'next'})
 def get(self,**kw):
  self.fetches.append(kw)
  return Result({'id':kw['id'],'messages':[{'id':kw['id'],'snippet':'A limited snippet','payload':{'headers':[{'name':'Subject','value':'Renewal notice'}]}}]})
api=SearchAPI();page=discover(api,'user@example.test')
assert len(api.searches)==4 and all(q['maxResults']==5 for q in api.searches)
assert all('newer_than:30d' in q['q'] for q in api.searches)
assert api.searches[0]['q']=='(newer_than:30d) -in:spam -in:trash', 'recent mail must not require a task keyword'
assert len(page['records'])==5 and len(page['coverage'])==4
assert api.batches==[2]*4 and [r['id'] for r in page['records']]==['thread:abc','thread:1','thread:2','thread:3','thread:4'],'batched fetches keep listing order'
assert all('-in:spam -in:trash' in q['q'] and 'is:unread' not in q['q'] for q in api.searches)
assert all(f['format']=='metadata' for f in api.fetches)
assert all(r['metadataOnly'] for r in normalize('gmail',page))
full=read_page(api,{'threads':True,'id':'thread:abc'},'user@example.test')
assert api.fetches[-1]['format']=='full' and not full['metadataOnly'] and api.batches==[2]*4,'a single thread read needs no batch'
# A failed sub-request fails the page instead of returning a partial one.
class FailingAPI(SearchAPI):
 def new_batch_http_request(self,callback):
  batch=Batch(self,callback)
  batch.execute=lambda:[callback(rid,None,RuntimeError('quota')) if rid=='1' else callback(rid,req.execute(),None) for rid,req in batch.items]
  return batch
try:read_page(FailingAPI(),{'threads':True,'query':'renewal'},'user@example.test')
except RuntimeError as error:assert str(error)=='quota'
else:raise AssertionError('failed batch part ignored')
for body in ({'query':'x'*513},{'metadataOnly':'yes'},{'id':'thread:abc','query':'renewal'}):
 try:read_page(api,body,'user@example.test')
 except ValueError:pass
 else:raise AssertionError('invalid search accepted')
for body in ({'discovery':'yes'},{'id':'abc'},{'query':'renewal'},{'unreadOnly':True}):
 try:discover(api,'user@example.test',body)
 except ValueError:pass
 else:raise AssertionError('ambiguous discovery accepted')
print('PASS bounded metadata discovery, deduplication, coverage, full fetch and search validation')

from gmail_reader import MailText
parser=MailText();parser.feed('<p>Kelvin (<a href="mailto:kelvin@example.test">kelvin@example.test</a>) invited you.</p><p><a href="https://example.test/join">Join conversation</a></p>')
assert 'Kelvin ([kelvin@example.test](<mailto:kelvin@example.test>)) invited you.' in ''.join(parser.parts)
assert '[Join conversation](<https://example.test/join>)' in ''.join(parser.parts)
# Sender layout becomes even Markdown: hidden preheaders, layout tables, pixels and stray emphasis drop out.
parser=MailText();parser.feed('<div style="display:none;max-height:0;overflow:hidden">Preview &#847;&zwnj;&nbsp;&#847;</div><table><tr><td><img src="x" alt="Logo"></td></tr><tr><td><h1>Statement ready</h1><p>Total <b> $12.50 </b> due.</p><b><p>One</p><p>Two</p></b><ul><li>Due Oct 25</li></ul></td></tr></table><img src="t" width="1" alt="open"><div class="gmail_quote">On Mon Kelvin wrote:<blockquote>Can we meet?<blockquote>Earlier</blockquote></blockquote></div>');parser.close()
html_text=parser.text()
assert html_text=='## Statement ready\n\nTotal **$12.50** due.\n\nOne\n\nTwo\n\n- Due Oct 25\n\nOn Mon Kelvin wrote:\n\n> Can we meet?\n>\n> > Earlier',html_text
both={**message,'payload':{'mimeType':'multipart/alternative','headers':message['payload']['headers'],'parts':[{'mimeType':'text/plain','body':{'data':encode('Hello\r\nhttps://example.test/very/long/tracking')}},{'mimeType':'text/html','body':{'data':encode('<p>Hello</p><p><a href="https://example.test/very/long/tracking">Open</a></p>')}}]}}
assert base64.urlsafe_b64decode(compact_message(both)['payload']['body']['data']).decode()=='Hello\n\n[Open](<https://example.test/very/long/tracking>)','the HTML part is the reading text'
print('PASS email HTML reads as even Markdown and is preferred over its plain alternative')
assert not compact_message(large,None)['excerptTruncated']
assert base64.urlsafe_b64decode(compact_message(large,None)['payload']['body']['data']).decode()=='中文邮件'*100000
class FullThread(API):
 def get(self,**kw):return Result({'id':'abc','messages':[message]*10})
full=read_page(FullThread(),{'threads':True,'id':'abc'},'user@example.test')
assert len(full['records'][0]['data']['thread']['messages'])==10
assert full['records'][0]['data']['thread']['messagesOmitted']==0

# A date after a long introduction must reach synthesis, not disappear at 1,600 chars.
long_body='Introduction. '*180+'Your appointment is confirmed for October 15 at 10 AM.'
message={"id":"abc","threadId":"abc","internalDate":"123","payload":{"mimeType":"text/plain","headers":[{"name":"Subject","value":"Confirmed appointment"}],"body":{"data":encode(long_body)}}}
row=normalize('gmail',{'records':[{'id':'abc','data':message}]})[0]
assert 'October 15' in row['text']
print('PASS confirmed date after long email introduction survives normalization')

# Latest-message coverage counts messages, while analysis reads deduplicated threads.
class MessageScanAPI(API):
 def list(self,**kw):
  self.query=kw
  return Result({'messages':[{'id':'a1','threadId':'abc'},{'id':'a2','threadId':'abc'},{'id':'b1','threadId':'def'}], 'nextPageToken':'second'})
api=MessageScanAPI()
page=read_page(api,{'threads':True,'scanMessages':True,'query':'in:anywhere','pageToken':'first'},'user@example.test')
assert page['scannedCount']==3 and len(page['records'])==2
assert [r['id'] for r in page['records']]==['thread:abc','thread:def']
assert api.query['pageToken']=='first' and '-in:spam -in:trash' in api.query['q']
assert page['nextPageToken']=='second'
declined=normalize('google-calendar',{'records':[{'id':'event','data':{'summary':'Meeting','start':{'dateTime':'2026-09-28T09:30:00-07:00'},'end':{'dateTime':'2026-09-28T10:30:00-07:00'},'attendees':[{'self':True,'responseStatus':'declined'}]}}]})[0]
assert declined['cancelled'] and declined['start'].endswith('09:30:00-07:00') and declined['end'].endswith('10:30:00-07:00')
print('PASS message scan counting, thread deduplication, cursor forwarding and declined Calendar evidence')

# An email's own picture (owner Order 2026-10-08): a declared banner-sized HTTPS image, never a pixel, logo,
# social icon, hidden image or insecure address; the newest received message's picture names the thread.
from gmail_reader import content_image
def picture(markup):
 parser=MailText();parser.feed(markup);parser.close();return parser.picture()
assert picture('<img src="https://e.test/o.gif" width="1" height="1"><img src="https://cdn.e.test/logo.png" width="300"><img src="https://cdn.e.test/hero.jpg" width="600" alt="Doors open at 7"><img src="https://cdn.e.test/b.jpg">')['src']=='https://cdn.e.test/hero.jpg'
assert picture('<img src="http://e.test/a.jpg" width="600"><img src="https://cdn.e.test/i/fb-icon.png"><img src="https://track.e.test/a.jpg"><img src="https://e.test/photo.jpg">')['src']=='https://e.test/photo.jpg'
assert picture('<div style="display:none"><img src="https://e.test/photo.jpg" width="600"></div><img src="https://e.test/s.png" style="width:40px">') is None
assert content_image({'src':'https://e.test/a.jpg','alt':'Company logo','width':'600'}) is None
html_part=lambda markup:{'mimeType':'text/html','body':{'data':encode(markup)}}
received={'id':'m2','threadId':'pic','internalDate':'200','labelIds':['INBOX'],'payload':{'mimeType':'multipart/alternative','headers':[{'name':'Subject','value':'Launch'}],'parts':[html_part('<p>Launch day.</p><img src="https://cdn.e.test/launch.jpg" width="640">')]}}
sent={'id':'m3','threadId':'pic','internalDate':'300','labelIds':['SENT'],'payload':{'mimeType':'multipart/alternative','headers':[{'name':'Subject','value':'Re: Launch'}],'parts':[html_part('<p>Thanks.</p><img src="https://cdn.e.test/mine.jpg" width="640">')]}}
thread={'id':'pic','messages':[compact_message(received),compact_message(sent)]}
assert normalize('gmail',{'records':[{'id':'thread:pic','data':{'thread':thread,'userEmail':'user@example.test'}}]})[0]['image']=='https://cdn.e.test/launch.jpg'
assert 'image' not in normalize('gmail',{'records':[{'id':'abc','data':message}]})[0]
print('PASS email pictures: banner-sized HTTPS content images only, from the newest received message')
