"""Bounded read-only Gmail pages. Unread queries have no arbitrary age cutoff."""
import base64
import json
import re
from html.parser import HTMLParser


class MailText(HTMLParser):
    """Email HTML as readable Markdown: paragraphs, headings, lists, quotes and labelled links.

    Layout tables, hidden preheaders, tracking pixels and styles are dropped; the sender's
    words and link targets are kept."""
    blocks = {'p', 'div', 'tr', 'table', 'section', 'article', 'header', 'footer', 'center', 'ul', 'ol', 'h5', 'h6', 'dl', 'dd', 'dt', 'address', 'pre'}
    headings = {'h1': '## ', 'h2': '## ', 'h3': '### ', 'h4': '### '}
    void = {'br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'area', 'base', 'wbr', 'source'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[]; self.hidden=0; self.link=None; self.stack=[]; self.bold=[]; self.images=[]
    @staticmethod
    def concealed(attrs):
        style=(attrs.get('style') or '').lower().replace(' ', '')
        return 'display:none' in style or 'mso-hide:all' in style or 'max-height:0' in style and 'overflow:hidden' in style or attrs.get('hidden') is not None or attrs.get('aria-hidden')=='true' and 'font-size:0' in style
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag in self.void:
            if self.hidden:return
            if tag=='br':self.parts.append('\n')
            elif tag=='hr':self.parts.append('\n\n---\n\n')
            elif tag=='img':
                alt=(attrs.get('alt') or '').strip()
                picture=content_image(attrs)
                if picture and len(self.images)<8:self.images.append(picture)
                # A linked image's alt is the link label; elsewhere only a sentence-like alt is
                # content. Logos, spacers and tracking pixels add only noise.
                if len(alt)>1 and (self.link or len(alt.split())>3) and not re.fullmatch(r'(?i)(logo|image|spacer|icon|banner|pixel|img)\W*\w{0,3}',alt) and str(attrs.get('width') or '') not in ('0','1'):
                    self.parts.append(alt)
            return
        hide=tag in ('style','script','head','title','template') or self.concealed(attrs)
        self.stack.append((tag,hide))
        if hide:self.hidden+=1
        if self.hidden:return
        if tag in self.headings:self.parts.append('\n\n'+self.headings[tag])
        elif tag in self.blocks:self.parts.append('\n\n')
        elif tag=='blockquote':self.parts.append('\n\n\x02')
        elif tag=='li':self.parts.append('\n- ')
        elif tag in ('td','th'):self.parts.append(' ')
        elif tag in ('strong','b'):self.bold.append(len(self.parts));self.parts.append('**')
        elif tag=='a':
            # HTMLParser represents a valueless attribute (<a href>) as None.
            # A malformed marketing link must not abort the entire sync page.
            url=attrs.get('href') or ''
            if url.startswith(('https://','http://','mailto:')):
                self.link=(len(self.parts),url)
    def handle_endtag(self, tag):
        if tag in self.void:return
        # Close the nearest matching element; unclosed children in sloppy mail close with it.
        for index in range(len(self.stack)-1,-1,-1):
            if self.stack[index][0]==tag:break
        else:return
        closing=self.stack[index:];del self.stack[index:]
        visible=not self.hidden
        self.hidden-=sum(1 for _,hide in closing if hide)
        if not visible:return
        if tag=='a' and self.link:
            start,url=self.link;label=re.sub(r'\s+',' ',''.join(self.parts[start:])).strip().strip('*').strip()
            self.parts[start:]=['['+(label or url).replace(']','\\]')+'](<'+url.replace('>','%3E')+'>)']
            self.link=None
        if tag in ('strong','b'):
            start=self.bold.pop() if self.bold else -1
            if 0<=start<len(self.parts) and self.parts[start]=='**':
                inner=''.join(self.parts[start+1:])
                # Emphasis that spans blocks, wraps a link or holds nothing would show as stray asterisks.
                if not inner.strip() or '\n' in inner or '[' in inner or self.link and self.link[0]>start:self.parts[start]=''
                else:self.parts[start:]=[(' ' if inner[0].isspace() else '')+'**'+inner.strip()+'**'+(' ' if inner[-1].isspace() else '')]
        if tag=='blockquote':self.parts.append('\x03\n\n')
        elif tag in self.blocks or tag in self.headings:self.parts.append('\n\n')
    def handle_data(self, data):
        if not self.hidden:self.parts.append(re.sub(r'\s+', ' ', data))
    def text(self):
        return tidy_mail(''.join(self.parts))
    def picture(self):
        """The sender's main picture: the first one declared at least banner-sized, else the first unsized one."""
        sized=[p for p in self.images if p['width']>=MIN_PICTURE_WIDTH]
        return (sized or [p for p in self.images if not p['width']] or [None])[0]


# An email's own picture can stand in for Worldlet's illustration on its Attention card. Only content
# pictures qualify: HTTPS, not declared smaller than a banner, and never a logo, icon, avatar, social
# badge, spacer or tracking pixel (by its alt, file name or address).
MIN_PICTURE_WIDTH=280
NOT_CONTENT=re.compile(r'(?i)(?:^|[\W_])(?:logos?|icons?|avatars?|badges?|spacer|pixel|beacon|track(?:ing)?|open|blank|clear|transparent|signature|facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|wechat|social|app-?store|google-?play|unsubscribe|footer)(?:$|[\W_\d])')
NOT_CONTENT_ALT=re.compile(r'(?i)\b(?:logos?|icons?|avatars?|badges?|spacer|pixel|signature|facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|wechat|app store|google play)\b')
def content_image(attrs):
    src=(attrs.get('src') or '').strip()
    if not src.startswith('https://') or len(src)>2000 or any(c.isspace() for c in src):return None
    def size(name):
        value=re.match(r'\s*(\d+)(?:px)?\s*$',str(attrs.get(name) or ''))
        style=re.search(r'(?:^|;)\s*'+name+r'\s*:\s*(\d+)px',(attrs.get('style') or '').lower())
        return int(value.group(1)) if value else int(style.group(1)) if style else 0
    width,height=size('width'),size('height')
    if 0<width<MIN_PICTURE_WIDTH or 0<height<120:return None
    alt=(attrs.get('alt') or '').strip()
    path=src.split('?')[0].split('#')[0]
    if NOT_CONTENT_ALT.search(alt) or NOT_CONTENT.search(path.rsplit('/',1)[-1]) or NOT_CONTENT.search(path.split('/',3)[2] if path.count('/')>=2 else ''):return None
    return {'src':src,'width':width,'height':height,'alt':alt[:200]}


INVISIBLE=re.compile('[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u3164\ufeff\uffa0]')
def tidy_mail(text):
    """Even paragraph spacing: no invisible padding, empty emphasis or runs of blank lines."""
    text=INVISIBLE.sub('',text).replace('\u00a0',' ').replace('\r\n','\n')
    # Innermost quotes first, so nested replies gain one marker per level.
    while True:
        changed=re.sub(r'\x02([^\x02\x03]*)\x03',lambda m:'\n'.join('> '+line if line.strip() else '>' for line in tidy_mail(m.group(1)).split('\n')),text)
        if changed==text:break
        text=changed
    text=text.replace('\x02','').replace('\x03','')
    lines=[re.sub(r'[ \t]+',' ',line).strip() for line in text.split('\n')]
    text='\n'.join(lines)
    text=re.sub(r'\n(?:>\s*\n){2,}','\n>\n',text)
    text=re.sub(r'\n{3,}','\n\n',text)
    text=re.sub(r'(?m)^(?:-\s*)$\n?','',text)
    return text.strip()


def compact_message(message, limit=24000):
    """Transport a bounded readable excerpt; never send inline MIME binaries."""
    plain=[]; rich=[]; attachments=[]; pictures=[]
    def visit(part, depth=0):
        if depth>20:return
        body=part.get('body') or {}
        if part.get('filename'):
            if limit is None or len(attachments)<30:attachments.append({'filename':part['filename'] if limit is None else part['filename'][:256],'body':{'size':body.get('size',0)}})
            return
        mime=part.get('mimeType','')
        if mime in ('text/plain','text/html') and body.get('data'):
            raw=body['data'];text=base64.urlsafe_b64decode(raw+'='*(-len(raw)%4)).decode('utf-8','replace')
            if mime=='text/plain':plain.append(text)
            else:
                parser=MailText();parser.feed(text);parser.close();rich.append(parser.text())
                if parser.picture():pictures.append(parser.picture())
        for child in part.get('parts',[]):visit(child,depth+1)
    visit(message.get('payload',{}))
    # The HTML part is the message as its sender laid it out; its plain alternative is often
    # an automatic flattening with bare tracking URLs. Use plain text only when it is all there is.
    text='\n'.join(part for part in rich if part.strip()) or '\n'.join(plain) or message.get('snippet','')
    raw=text.encode('utf-8');truncated=limit is not None and len(raw)>limit
    text=raw[:limit].decode('utf-8','ignore')
    if truncated:text+='\n[Excerpt shortened. Open the original in Gmail for the complete message.]'
    headers=[{'name':h.get('name',''),'value':str(h.get('value','')) if limit is None else str(h.get('value',''))[:1000]} for h in message.get('payload',{}).get('headers',[]) if h.get('name','').lower() in ('subject','from','to','cc','date','message-id','in-reply-to','references')][:12]
    remaining=2000 if limit is not None else sum(len(h['value'].encode()) for h in headers)
    for header in headers:
        header['value']=header['value'].encode('utf-8')[:remaining].decode('utf-8','ignore');remaining-=len(header['value'].encode('utf-8'))
    result={k:message[k] for k in ('id','threadId','labelIds','internalDate','historyId','sizeEstimate') if k in message}
    result['snippet']=message.get('snippet','')[:1000]
    result['payload']={'mimeType':'text/plain','headers':headers,'body':{'data':base64.urlsafe_b64encode(text.encode()).decode()},'parts':attachments}
    result['excerptTruncated']=truncated
    if pictures:result['picture']=pictures[0]
    return result


def fetch_all(api, requests):
    """Execute Gmail GET requests in one batch round trip, returning results in request order.

    googleapiclient services share one httplib2 connection and are not thread-safe,
    so the page is fetched as a single Gmail batch request instead of worker threads.
    """
    if len(requests) <= 1:
        return [request.execute() for request in requests]
    results, errors = [None] * len(requests), {}
    def done(request_id, response, exception):
        index = int(request_id)
        if exception is not None:
            errors[index] = exception
        else:
            results[index] = response
    batch = api.new_batch_http_request(callback=done)
    for index, request in enumerate(requests):
        batch.add(request, request_id=str(index))
    batch.execute()
    if errors:
        raise errors[min(errors)]
    return results


def read_page(api, body, email):
    limit=body.get('limit',20)
    if isinstance(limit,bool) or not isinstance(limit,int) or not 1 <= limit <= 20:
        raise ValueError('Gmail limit must be between 1 and 20.')
    unread = body.get('unreadOnly', False)
    if not isinstance(unread, bool):
        raise ValueError('unreadOnly must be a boolean.')
    token = body.get('pageToken', '')
    if not isinstance(token, str) or len(token) > 2048:
        raise ValueError('Invalid Gmail page token.')
    query_text = body.get('query', '')
    metadata = body.get('metadataOnly', False)
    if not isinstance(query_text,str) or len(query_text)>512 or '\x00' in query_text: raise ValueError('Invalid Gmail search query.')
    if not isinstance(metadata,bool): raise ValueError('metadataOnly must be a boolean.')
    identifier = body.get('id', '')
    if not isinstance(identifier, str): raise ValueError('Invalid Gmail thread ID.')
    identifier = identifier.removeprefix('thread:')
    if identifier and (len(identifier) > 64 or any(c not in '0123456789abcdefABCDEF' for c in identifier)):
        raise ValueError('Invalid Gmail thread ID.')
    if identifier and (token or unread or query_text):
        raise ValueError('Use either a thread ID or a filtered page, not both.')
    threads = bool(body.get('threads'))
    scan_messages = body.get('scanMessages', False)
    if not isinstance(scan_messages, bool): raise ValueError('Invalid scan mode.')
    resource = api.users().messages() if scan_messages else api.users().threads() if threads else api.users().messages()
    key = 'messages' if scan_messages else 'threads' if threads else 'messages'
    query = ('('+query_text+') '+('is:unread ' if unread else '') if query_text else 'is:unread ' if unread else 'newer_than:30d ') + '-in:spam -in:trash'
    listing = {key: [{'id': identifier}]} if identifier else resource.list(
        userId='me', q=query, maxResults=limit, **({'pageToken': token} if token else {})).execute()
    records, seen = [], set()
    items = []
    for item in listing.get(key, []):
        if scan_messages:
            thread_id = item.get('threadId')
            if not thread_id: raise ValueError('Message has no thread identity.')
            if thread_id in seen: continue
            seen.add(thread_id)
            item = {'id': thread_id}
        items.append(item)
    if scan_messages:
        resource = api.users().threads()
    fetched = fetch_all(api, [resource.get(userId='me', id=item['id'], format='metadata' if metadata else 'full', **({'metadataHeaders':['Subject','From','To','Date']} if metadata else {})) for item in items])
    for item, data in zip(items, fetched):
        messages = data.get('messages', []) if threads else [data]
        # A user may read a thread between list and get. Do not call it unread.
        if unread and not any('UNREAD' in m.get('labelIds', []) for m in messages):
            continue
        if threads:
            recent=sorted(messages,key=lambda m:int(m.get('internalDate',0)),reverse=True)
            if not identifier:recent=recent[:8]
            data={**{k:data[k] for k in ('id','historyId') if k in data},'messages':[compact_message(m,None if identifier else 12000//max(1,len(recent))) for m in recent],'messagesOmitted':max(0,len(messages)-len(recent))}
        else:data=compact_message(data,None if identifier else 24000)
        if identifier and len(json.dumps(data).encode())>1800000:
            raise ValueError('This complete email is too large for the reader. Open the original in Gmail; no shortened copy is shown.')
        records.append({'id': ('thread:' if threads else '') + item['id'],
                        'data': {'thread': data, 'userEmail': email} if threads else data})
    return {'scannedCount':len(listing.get(key,[])), 'records': records, 'metadataOnly':metadata,'query':query, 'unreadOnly': unread, 'nextPageToken': listing.get('nextPageToken', ''),
            'scope': ('Search matches' if query_text else 'Unread' if unread else 'Recent 30 days') + (' threads' if threads else ' messages') +
                     ' · This page only, up to 20 · Read only; no read state changed'}

# Metadata-first; the model must fetch promising threads before publishing evidence.
DISCOVERY_QUERIES = [
    ('recent', 'newer_than:30d'),
    ('meetings', 'newer_than:30d {"invitation" "meeting" "appointment" "会议" "预约"}'),
    ('renewals', 'newer_than:30d {"trial ends" "renewal" "renews" "续费" "试用到期"}'),
    ('obligations', 'newer_than:30d {"RSVP" "please confirm" "action required" "deadline" "请确认" "截止"}'),
]

def discover(api, email, body=None):
    body=body or {}
    if body.get("discovery",True) is not True or any(body.get(key) for key in ("id","pageToken","query","unreadOnly")):
        raise ValueError("Discovery cannot be combined with a thread ID or other search filters.")
    records, seen, coverage = [], set(), []
    for family, query in DISCOVERY_QUERIES:
        page=read_page(api, {'threads':True,'metadataOnly':True,'query':query,'limit':5}, email)
        coverage.append({'family':family,'count':len(page['records']),'hasMore':bool(page.get('nextPageToken'))})
        for row in page['records']:
            if row['id'] not in seen:
                seen.add(row['id']);records.append(row)
    return {'ok':True,'records':records,'metadataOnly':True,'coverage':coverage,
            'scope':'Four searches within the past 30 days, up to five threads each (20 total); read/unread and archived mail included, spam/trash excluded. Metadata only; not an exhaustive inbox check.'}
