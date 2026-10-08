"""Mail drafts are reviewed in Fox; only the trusted native button can send."""
import base64
from email.message import EmailMessage
from email.utils import getaddresses, make_msgid
import json
import hashlib
import os
import tempfile
import uuid
from pathlib import Path
import re

SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

def address(value):
    if not isinstance(value,str) or '\r' in value or '\n' in value:
        raise ValueError('Invalid email address.')
    # Pythons before the CVE-2023-27043 fix (3.12.3 on the Windows host) parse a
    # comma list as its first address, so count every address instead.
    parsed=getaddresses([value])
    parsed=parsed[0][1] if len(parsed)==1 else ''
    if not re.fullmatch(r"[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+",parsed):
        raise ValueError('Provide one exact recipient email address.')
    return parsed

def prepare(api,args):
    subject=args.get('subject',''); body=args.get('body','')
    if not isinstance(subject,str) or len(subject)>300 or any(c in subject for c in '\r\n') or not isinstance(body,str) or not 1<=len(body)<=30000:
        raise ValueError('Invalid email subject or body.')
    sender=address(api.users().getProfile(userId='me').execute()['emailAddress'])
    draft={'from':sender,'to':args.get('to',''),'subject':subject,'body':body}
    thread=args.get('threadId','').removeprefix('live:gmail:').removeprefix('thread:')
    if thread:
        if not re.fullmatch(r'[a-fA-F0-9]{1,64}',thread):raise ValueError('Invalid Gmail thread.')
        # A reply's sender and subject come from threadId, so it must be the thread the turn cited.
        cited={str(s).removeprefix('live:gmail:').removeprefix('thread:') for s in args.get('sourceIds') or [] if str(s).startswith(('thread:','live:gmail:'))}
        if cited and thread not in cited:raise ValueError('threadId '+thread+' is not among sourceIds '+', '.join(sorted(cited))+'. Use the Gmail thread ID of the email being replied to.')
        messages=api.users().threads().get(userId='me',id=thread,format='metadata',metadataHeaders=['From','Reply-To','To','Cc','Message-ID','References','Subject']).execute().get('messages',[])
        if not messages:raise ValueError('The reply thread is empty.')
        latest=max(messages,key=lambda m:int(m.get('internalDate',0)))
        headers={h['name'].lower():h['value'] for h in latest.get('payload',{}).get('headers',[])}
        # The review header (recipient, subject) comes from the thread while the body comes from the
        # model, so a wrong threadId would pair one person's reply with another email's header (#1623).
        if draft['to']:
            participants={a.lower() for m in messages for h in m.get('payload',{}).get('headers',[]) if h['name'].lower() in ('from','reply-to','to','cc') for _,a in getaddresses([h['value']])}
            if address(draft['to']).lower() not in participants:
                raise ValueError('Recipient '+draft['to']+' is not part of thread '+thread+' ('+(headers.get('subject') or 'no subject')+'). Use the Gmail thread ID of the email being replied to, or omit threadId for a new email.')
        else:
            draft['to']=headers.get('reply-to') or headers.get('from','')
            name=greeted(body)
            if name and name.lower() not in draft['to'].lower():
                raise ValueError('The draft greets '+name+' but thread '+thread+' replies to '+draft['to']+' ('+(headers.get('subject') or 'no subject')+'). Use the Gmail thread ID of the email being replied to, or give the exact recipient in to.')
        draft['threadId']=thread
        for key,header in [('inReplyTo','message-id'),('references','references')]:
            value=headers.get(header,'')
            if '\n' in value or '\r' in value:raise ValueError('Invalid reply headers.')
            draft[key]=value[:2000]
        # Gmail groups replies using both the thread and matching subject.
        draft['subject']=headers.get('subject') or subject
    draft['to']=address(draft['to'])
    if draft['to'].lower()==sender.lower() and not args.get('to'):
        raise ValueError('The latest message is yours. Please specify the recipient explicitly.')
    return draft

GREETING=re.compile(r"\s*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))[ ,]+(?:(?:dr|mr|mrs|ms|mx|prof)\.? +)?([^\W\d_][\w'\u2019-]*)",re.I)
NOT_NAMES={'there','all','everyone','team','folks','both','again','guys','y','you','friend','friends','sir','madam'}

def greeted(body):
    """The name a draft opens with ("Hi Priya," -> Priya), or '' for no or a generic greeting."""
    match=GREETING.match(body)
    return match.group(1) if match and match.group(1).lower() not in NOT_NAMES else ''

def receipt_path(home, identifier):
    # Accept Swift uppercase and .NET lowercase UUIDs; reject non-UUID paths.
    if str(uuid.UUID(identifier)) != identifier.lower():raise ValueError('Invalid mail review ID.')
    root=Path(home)/'mail-receipts';root.mkdir(mode=0o700,exist_ok=True)
    canonical=root/(identifier.lower()+'.json')
    if canonical.exists():return canonical
    # Preserve pre-normalization Swift receipts on case-sensitive filesystems.
    legacy=root/(identifier.upper()+'.json')
    return legacy if legacy.exists() else canonical

def draft_hash(draft):
    return hashlib.sha256(json.dumps(draft,sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def save_receipt(path, value):
    fd, temporary=tempfile.mkstemp(dir=path.parent,prefix='.receipt-')
    try:
        with os.fdopen(fd,'w') as out:
            json.dump(value,out);out.flush();os.fsync(out.fileno())
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)

def reviewed_sender(api,draft):
    sender=address(api.users().getProfile(userId='me').execute()['emailAddress'])
    if sender.lower()!=address(draft['from']).lower():raise RuntimeError('Google account changed. Prepare a new draft.')
    return sender

def reconcile(api,home,draft,identifier):
    """Read-only reconciliation. A missing search result NEVER authorizes resending."""
    path=receipt_path(home,identifier)
    sender=reviewed_sender(api,draft)
    if not path.exists():return {'status':'unknown','reason':'no_receipt'}
    previous=json.loads(path.read_text())
    if previous.get('sender') != sender.lower() or previous.get('draftHash') != draft_hash(draft):
        # Old receipts cannot be safely matched to a reviewed message/account.
        return {'status':'unknown','reason':'unmatched_receipt'}
    if previous.get('status')=='sent':return previous
    message_id=previous.get('rfcMessageId','')
    if not re.fullmatch(r'<[^<>\s]+@[^<>\s]+>',message_id):return {'status':'unknown','reason':'missing_message_id'}
    # Gmail documents rfc822msgid search. Verify exact metadata and Sent label too.
    result=api.users().messages().list(userId='me',q='rfc822msgid:'+message_id,labelIds=['SENT'],maxResults=10).execute()
    for candidate in result.get('messages',[]):
        message=api.users().messages().get(userId='me',id=candidate['id'],format='metadata',metadataHeaders=['Message-ID','From','To']).execute()
        headers={h['name'].lower():h['value'] for h in message.get('payload',{}).get('headers',[])}
        if ('SENT' not in message.get('labelIds',[]) or headers.get('message-id')!=message_id
            or address(headers.get('from','')).lower()!=sender.lower()
            or address(headers.get('to','')).lower()!=address(draft['to']).lower()):continue
        value={**previous,'ok':True,'status':'sent','messageId':message['id'],'threadId':message.get('threadId','')}
        save_receipt(path,value);return value
    return {'status':'unknown','reason':'not_found_yet'}

def send(api,home,draft,identifier):
    receipt=receipt_path(home,identifier)
    sender=reviewed_sender(api,draft)
    if receipt.exists():
        previous=reconcile(api,home,draft,identifier)
        if previous.get('status')=='sent':return previous
        raise RuntimeError('Sending was already attempted. Check delivery; do not send another copy while the result is uncertain.')
    message=EmailMessage();message['From']=sender;message['To']=address(draft['to']);message['Subject']=draft['subject'];message['Message-ID']=make_msgid(idstring=identifier,domain='worldlet.local')
    if draft.get('inReplyTo'):message['In-Reply-To']=draft['inReplyTo'];message['References']=' '.join(filter(None,[draft.get('references'),draft['inReplyTo']]))
    message.set_content(draft['body'])
    payload={'raw':base64.urlsafe_b64encode(message.as_bytes()).decode()}
    if draft.get('threadId'):payload['threadId']=draft['threadId']
    pending={'status':'sending','sender':sender.lower(),'draftHash':draft_hash(draft),'rfcMessageId':str(message['Message-ID'])}
    # Exclusive creation prevents concurrent duplicate sends; persist identity before dispatch.
    fd=os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as out:
        json.dump(pending,out);out.flush();os.fsync(out.fileno())
    result=api.users().messages().send(userId='me',body=payload).execute(num_retries=0)
    if not result.get('id'):raise RuntimeError('Delivery status is unknown. Check delivery; do not send again.')
    value={**pending,'ok':True,'status':'sent','messageId':result['id'],'threadId':result.get('threadId','')}
    save_receipt(receipt,value);return value
