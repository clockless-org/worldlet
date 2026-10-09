import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {GoogleRest,MailReceipts} from '../core/accounts/index.ts';
import {read as readDrive,csvRows} from '../core/accounts/google/drive.ts';
import {readCalendar,readDriveList,googleReadResult} from '../core/accounts/google/reads.ts';
import {address,greeted,prepare,draftHash,reconcile,send} from '../core/accounts/google/mail.ts';
import {normalize,sourceFailure} from '../core/accounts/google/normalize.ts';
import {getaddresses} from '../core/accounts/google/addresses.ts';
import {unescape,htmlEntities} from '../core/accounts/google/html.ts';
import {pyJson} from '../core/accounts/google/python.ts';
// The World's own Google connection (core/accounts) answers exactly what the Hermes Python it replaces answered:
// drive_reader.read, the Calendar and Drive parts of host.py _google_reads, mail_actions and source_reader's
// normalize/source_failure run on the same fictional fixtures through a fake googleapiclient, and their results,
// error messages, REST calls and receipts must match. A sent message is compared as Python parses it (headers
// decoded, body, transfer encoding) because Python's own header folding is not reproduced.

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PYTHON=String.raw`
import ast, base64, contextlib, copy, csv, datetime as real, html, io, json, sys, tempfile, types, urllib.parse
from pathlib import Path
from email import message_from_bytes, policy
sys.path.insert(0, sys.argv[1] + '/harness/hermes')
import drive_reader, mail_actions, source_reader
from email.utils import getaddresses
from html.entities import html5
tree = ast.parse(Path(sys.argv[1] + '/harness/hermes/host.py').read_text(encoding='utf-8'))
reads = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_google_reads')
q = lambda v: urllib.parse.quote(str(v), safe='')
class Api:
    def __init__(s, routes): s.routes, s.calls = routes, []
    def call(s, method, path, query, body=None):
        api = s
        class Request:
            def execute(self, **_):
                api.calls.append([method, path, query] + ([body] if body is not None else []))
                answer = copy.deepcopy(api.routes.get(path, {}))
                return base64.b64decode(answer['$bytes']) if isinstance(answer, dict) and '$bytes' in answer else answer
        return Request()
    # Drive
    def files(s): return types.SimpleNamespace(list=lambda **k: s.call('GET', 'drive/v3/files', k),
        get=lambda fileId, **k: s.call('GET', 'drive/v3/files/' + q(fileId), k),
        export_media=lambda fileId, mimeType: s.call('BYTES', 'drive/v3/files/' + q(fileId) + '/export', {'mimeType': mimeType}))
    def about(s): return types.SimpleNamespace(get=lambda **k: s.call('GET', 'drive/v3/about', k))
    # Calendar
    def events(s): return types.SimpleNamespace(get=lambda calendarId, eventId: s.call('GET', 'calendar/v3/calendars/' + q(calendarId) + '/events/' + q(eventId), {}),
        list=lambda calendarId, **k: s.call('GET', 'calendar/v3/calendars/' + q(calendarId) + '/events', k))
    # Gmail
    def users(s):
        base = lambda u: 'gmail/v1/users/' + q(u)
        return types.SimpleNamespace(getProfile=lambda userId: s.call('GET', base(userId) + '/profile', {}),
            threads=lambda: types.SimpleNamespace(get=lambda userId, id, **k: s.call('GET', base(userId) + '/threads/' + q(id), k)),
            messages=lambda: types.SimpleNamespace(list=lambda userId, **k: s.call('GET', base(userId) + '/messages', k),
                get=lambda userId, id, **k: s.call('GET', base(userId) + '/messages/' + q(id), k),
                send=lambda userId, body: s.call('POST', base(userId) + '/messages/send', {}, body)))

def mime(raw):
    m = message_from_bytes(base64.urlsafe_b64decode(raw), policy=policy.default)
    return {'headers': [[k, str(v)] for k, v in m.items()], 'type': m.get_content_type(), 'charset': m.get_content_charset(),
            'cte': m['Content-Transfer-Encoding'], 'payload': m.get_payload(), 'content': m.get_content(),
            'defects': [type(d).__name__ for d in m.defects] + [type(d).__name__ for _, v in m.items() for d in v.defects]}

FUNCTIONS = {'address': mail_actions.address, 'greeted': mail_actions.greeted, 'unescape': html.unescape,
    'getaddresses': lambda v: [a for _, a in getaddresses([v])], 'dumps': lambda v: json.dumps(v, sort_keys=True, ensure_ascii=False),
    'hash': mail_actions.draft_hash, 'csv': lambda v: list(csv.reader(io.StringIO(v))), 'failure': source_reader.source_failure}

def run(case, home, api):
    kind = case['kind']
    if kind == 'fn': return FUNCTIONS[case['name']](*case['args'])
    if kind == 'drive': return drive_reader.read(api, case['body'])
    if kind == 'normalize': return source_reader.normalize(case['provider'], case['result'])
    if kind == 'google':
        class Now(real.datetime):
            @classmethod
            def now(cls, tz=None): return cls.fromtimestamp(case['now'] / 1000, tz)
        namespace = {'datetime': types.SimpleNamespace(datetime=Now, timezone=real.timezone, timedelta=real.timedelta), 'HERMES_DIR': home, 'contextlib': contextlib, 'json': json}
        exec(compile(ast.Module(body=[reads], type_ignores=[]), 'host-google-reads', 'exec'), namespace)
        return namespace['_google_reads'](case['body'], case['operation'], lambda name, version: api, lambda: [])
    if kind == 'prepare': return mail_actions.prepare(api, case['args'])
    folder = home / 'mail-receipts'; folder.mkdir(exist_ok=True)
    for key, value in case.get('receipts', {}).items(): (folder / (key + '.json')).write_text(json.dumps(value))
    action = mail_actions.send if kind == 'send' else mail_actions.reconcile
    return action(api, home, case['draft'], case['id'])

# stdin is read as UTF-8 bytes: on Windows Python's text stdin uses the ANSI code page (cp1252), which garbles the
# fixtures' non-ASCII text.
if sys.argv[2] == 'mime':
    print(json.dumps([mime(raw) for raw in json.loads(sys.stdin.buffer.read().decode('utf-8'))], ensure_ascii=True)); sys.exit()
if sys.argv[2] == 'entities':
    print(json.dumps(html5, ensure_ascii=True)); sys.exit()
out = []
for case in json.loads(sys.stdin.buffer.read().decode('utf-8')):
    with tempfile.TemporaryDirectory() as temporary:
        home = Path(temporary)
        api = Api(case.get('routes', {}))
        try:
            entry = {'value': run(case, home, api)}
        except Exception as error:
            entry = {'error': str(error)}
        entry['calls'] = api.calls
        folder = home / 'mail-receipts'
        if folder.exists(): entry['receipts'] = {p.stem: json.loads(p.read_text()) for p in sorted(folder.glob('*.json'))}
        out.append(entry)
print(json.dumps(out, ensure_ascii=True))
`;
function python(mode:string,input:unknown){
 const run=spawnSync('python3',['-I','-c',PYTHON,root,mode],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:1<<28});
 assert.equal(run.status,0,run.stderr);
 return JSON.parse(run.stdout);
}

const b64=(text:string|Uint8Array)=>Buffer.from(typeof text==='string'?Buffer.from(text,'utf8'):text).toString('base64');
const url64=(text:string)=>Buffer.from(text,'utf8').toString('base64url');
class FakeRest implements GoogleRest {
 calls:any[]=[];routes:Record<string,any>;
 constructor(routes:Record<string,any>={}){this.routes=routes;}
 answer(path:string){const value=this.routes[path];return value===undefined?{}:JSON.parse(JSON.stringify(value));}
 async get(path:string,query={}){this.calls.push(['GET',path,query]);return this.answer(path);}
 async getAll(requests:{path:string;query?:any}[]){return Promise.all(requests.map(r=>this.get(r.path,r.query)));}
 async post(path:string,body:unknown,query={}){this.calls.push(['POST',path,query,body]);return this.answer(path);}
 async bytes(path:string,query={}){this.calls.push(['BYTES',path,query]);const value=this.answer(path);return value.$bytes===undefined?value:new Uint8Array(Buffer.from(value.$bytes,'base64'));}
}
class Receipts implements MailReceipts {
 store=new Map<string,Record<string,unknown>>();
 read(id:string){const v=this.store.get(id);return v?structuredClone(v):null;}
 create(id:string,value:Record<string,unknown>){if(this.store.has(id))return false;this.store.set(id,structuredClone(value));return true;}
 write(id:string,value:Record<string,unknown>){this.store.set(id,structuredClone(value));}
}
const FUNCTIONS:Record<string,(...args:any[])=>unknown>={address,greeted,unescape,getaddresses,dumps:pyJson,hash:draftHash,csv:(v:string)=>[...csvRows(v)],failure:sourceFailure};
async function port(c:any){
 const api=new FakeRest(c.routes),receipts=new Receipts(),entry:any={};
 for(const [key,value] of Object.entries(c.receipts??{}))receipts.write(key,value as any);
 try{
  entry.value=await (c.kind==='fn'?FUNCTIONS[c.name](...c.args)
   :c.kind==='drive'?readDrive(api,c.body)
   :c.kind==='normalize'?normalize(c.provider,c.result)
   :c.kind==='google'?(c.body.service==='google-calendar'?readCalendar(api,c.body,c.operation,c.now)
    :c.body.service==='google-drive'?readDriveList(api,c.operation)
    :c.body.service==='gmail'?api.get('gmail/v1/users/me/profile').then(p=>googleReadResult('gmail',p.emailAddress,{records:[],nextPageToken:'',scope:'Connection check only'}))
    :googleReadResult(c.body.service,'',{records:[]}))
   :c.kind==='prepare'?prepare(api,c.args)
   :(c.kind==='send'?send:reconcile)(api,receipts,c.draft,c.id));
 }catch(error){entry.error=error.message;}
 entry.calls=api.calls;
 if(['send','reconcile'].includes(c.kind))entry.receipts=Object.fromEntries([...receipts.store].sort(([a],[b])=>a<b?-1:1));
 return entry;
}

// Fixtures: fictional accounts and files only.
const DOC='application/vnd.google-apps.document',SHEET='application/vnd.google-apps.spreadsheet',SLIDES='application/vnd.google-apps.presentation';
const doc=(id:string,mime:string,extra={})=>({id,name:'File '+id,mimeType:mime,modifiedTime:'2026-10-01T10:00:00Z',description:'About '+id,...extra});
const exported=(id:string,mime:string,text:string|Uint8Array)=>({['drive/v3/files/'+id]:doc(id,mime,{capabilities:{canDownload:true}}),['drive/v3/files/'+id+'/export']:{$bytes:b64(text)}});
const csvText='Name,Note\r\n"Doe, Alex","two\nlines"\r\n\r\n"say ""hi""",x\r\nlast,"open';
const cases:any[]=[
 {kind:'drive',body:{readOperation:'list'},routes:{'drive/v3/files':{files:[doc('doc1',DOC),doc('pdf1','application/pdf',{description:undefined}),{id:'s1',name:'Sheet',mimeType:SHEET}],nextPageToken:'n2'}}},
 {kind:'drive',body:{readOperation:'list',applet:'google-sheets',cursor:'abc'},routes:{'drive/v3/files':{files:[]}}},
 {kind:'drive',body:{readOperation:'list',applet:'google-slides',cursor:''},routes:{'drive/v3/files':{files:[doc('p1',SLIDES,{modifiedTime:null})]}}},
 {kind:'drive',body:{readOperation:'list',cursor:7}},{kind:'drive',body:{readOperation:'list',cursor:'x'.repeat(4097)}},
 {kind:'drive',body:{readOperation:'list',cursor:'é'.repeat(4096)},routes:{'drive/v3/files':{files:[]}}},
 {kind:'drive',body:{readOperation:'list',applet:'other'}},{kind:'drive',body:{readOperation:'list',applet:['google-docs']}},{kind:'drive',body:{readOperation:'list',applet:null}},
 {kind:'drive',body:{readOperation:'list'},routes:{'drive/v3/files':{files:{}}}},
 {kind:'drive',body:{readOperation:'list'},routes:{'drive/v3/files':{files:[{id:'x'}]}}},
 {kind:'drive',body:{readOperation:'list'},routes:{'drive/v3/files':{files:[{id:'../x',name:'Bad'}]}}},
 {kind:'drive',body:{readOperation:'move'}},{kind:'drive',body:{}},
 {kind:'drive',body:{readOperation:'read',id:'../x'}},{kind:'drive',body:{readOperation:'read'}},{kind:'drive',body:{readOperation:'read',id:'a'.repeat(257)}},
 {kind:'drive',body:{readOperation:'read',id:'pdf1'},routes:{'drive/v3/files/pdf1':doc('pdf1','application/pdf')}},
 {kind:'drive',body:{readOperation:'read',id:'doc1'},routes:{'drive/v3/files/doc1':doc('doc1',DOC,{capabilities:{canDownload:false}})}},
 {kind:'drive',body:{readOperation:'read',id:'doc1'},routes:{'drive/v3/files/doc1':doc('doc1',DOC)}},
 {kind:'drive',body:{readOperation:'read',id:'doc1'},routes:{'drive/v3/files/doc1':doc('other',DOC)}},
 {kind:'drive',body:{readOperation:'read',id:'doc1',applet:'google-sheets'},routes:{'drive/v3/files/doc1':doc('doc1',DOC)}},
 {kind:'drive',body:{readOperation:'read',id:'doc1',applet:'google-docs'},routes:exported('doc1',DOC,'﻿Plan\r\nStep one · café\n')},
 {kind:'drive',body:{readOperation:'read',id:'p1'},routes:exported('p1',SLIDES,'﻿﻿Slide')},
 {kind:'drive',body:{readOperation:'read',id:'s1',applet:'google-sheets'},routes:exported('s1',SHEET,'﻿'+csvText)},
 {kind:'drive',body:{readOperation:'read',id:'s1'},routes:exported('s1',SHEET,'a,b\n"x\ry",c\r\n\n\r,\n"q"tail,"z"\n')},
 {kind:'drive',body:{readOperation:'read',id:'s1'},routes:exported('s1',SHEET,'a\rb\n')},
 {kind:'drive',body:{readOperation:'read',id:'s1'},routes:exported('s1',SHEET,'r\n'.repeat(2000))},
 {kind:'drive',body:{readOperation:'read',id:'s1'},routes:exported('s1',SHEET,'r\n'.repeat(2001)+'a\rb\n')},
 {kind:'drive',body:{readOperation:'read',id:'s1'},routes:exported('s1',SHEET,','.repeat(99)+'\n'+','.repeat(100))},
 {kind:'drive',body:{readOperation:'read',id:'doc1'},routes:exported('doc1',DOC,'x'.repeat(2*1024*1024+1))},
 {kind:'drive',body:{readOperation:'read',id:'doc1'},routes:exported('doc1',DOC,'x'.repeat(2*1024*1024))},
 {kind:'drive',body:{readOperation:'read',id:'doc1'},routes:exported('doc1',DOC,new Uint8Array([0x61,0xff])),errorOnly:true},
];
const NOW=Date.UTC(2026,9,9,12,34,56,789),events={'calendar/v3/calendars/primary/events':{summary:'Alex Example',items:[{id:'ev1',summary:'Standup'},{id:'ev2'}],nextPageToken:'p2'}};
for(const body of [{},{id:''},{limit:'5'},{limit:' 7 '},{limit:99},{limit:0},{limit:3.7},{limit:true},{limit:'abc'},{limit:null},{limit:[]},{limit:'1_0'},
 {windowStart:1760000000.123456},{windowStart:-1.5},{windowStart:true},{windowStart:0},{windowStart:'soon'},{windowStart:null},{windowStart:1760000000.0000005},
 {pageToken:'tok'},{pageToken:5},{pageToken:'t'.repeat(2049)},{windowDays:7},{windowDays:0.5},{windowDays:-2},{windowDays:'x'},{windowDays:null},{windowDays:false},
 {id:'ev_1-x'},{id:'../other'},{id:'x'.repeat(257)},{id:'event世'},{id:[]},{id:null}])
 for(const operation of ['read','test'])cases.push({kind:'google',operation,now:NOW,body:{service:'google-calendar',...body},routes:{...events,'calendar/v3/calendars/primary/events/ev_1-x':{id:'ev_1-x',summary:'One'}}});
cases.push({kind:'google',operation:'read',now:NOW,body:{service:'google-calendar',id:'ev9'},routes:{'calendar/v3/calendars/primary/events/ev9':{id:'other'}}},
 {kind:'google',operation:'read',now:Date.UTC(2026,0,1),body:{service:'google-calendar'},routes:{'calendar/v3/calendars/primary/events':{items:[]}}},
 {kind:'google',operation:'read',now:NOW,body:{service:'google-calendar'}});
for(const operation of ['read','test'])cases.push(
 {kind:'google',operation,now:NOW,body:{service:'google-drive'},routes:{'drive/v3/about':{user:{emailAddress:'alex@example.com'}},'drive/v3/files':{files:[{id:'f1',name:'Plan'}],nextPageToken:'ignored'}}},
 {kind:'google',operation,now:NOW,body:{service:'google-drive'}},
 {kind:'google',operation:'test',now:NOW,body:{service:'gmail'},routes:{'gmail/v1/users/me/profile':{emailAddress:'alex@example.com'}}},
 {kind:'google',operation,now:NOW,body:{service:'dropbox'}});

const fn=(name:string,...args:any[])=>({kind:'fn',name,args});
for(const v of ['alex@example.com','Alex Example <alex@example.com>','"Example, Alex" <alex@example.com>','alex@example.com, sam@example.com','one@example.com,two@example.com','Alex',
 'alex@example.com\nBcc: x@example.com','alex@example.com\r',' alex@example.com ','<alex@example.com>','alex@[192.0.2.10]','alex@example','a@b@example.com','alex(work)@example.com','(Alex) alex@example.com',
 'Alex (unbalanced <alex@example.com>','alex@example.com)','group: alex@example.com, sam@example.com;','group: alex@example.com;','"a\\"b" <alex@example.com>','alex.@example.com','.alex@example.com',
 'josé@exämple.com','alex x@example.com','alex@ example . com','alex @example.com','Alex <alex@example.com> extra','"quoted local"@example.com','alex@example.com;','',5,null])
 cases.push(fn('address',v),...(typeof v==='string'?[fn('getaddresses',v)]:[]));
for(const v of ['Hi Alex,\nThanks','Hey, Sam!','Hi there,','Thanks Alex','Dear Dr. Sam,','  hello   mrs  Example','Good morning Sam','good evening team','HI ALEX','Hi José,','Hi 2Alex','Hi _x',"Hello O'Neil-Smith,","Hi Ana’s",'Hi　Alex',' Hi Alex','Hi,,Alex','Hiya Alex','Hey y','Hi Kai'])
 cases.push(fn('greeted',v));
for(const v of ['a &amp; b','&lt;&gt;&quot;&#39;&apos;','&#x41;&#65;&#X42','&#128;&#0;&#13;&#x110000;&#xD800;&#1;&#xFFFE;','&notit;&notin;&not','&ampx &copy2023 &AMP;','&unknown; & alone &','&#99999999999999999999;','&Aring;&aring;&#x1F600;','&nbsp&nbsp;','&'+'a'.repeat(40)+';','no refs'])
 cases.push(fn('unescape',v));
for(const v of [{b:'two',a:'one',é:'é ',q:'"\\\n\t\x01\x7f'},{from:'alex@example.com',to:'sam@example.com',subject:'Café',body:'Hi\n'},[1,2.5,true,null,{z:{}}],{'😀':1,'￿':2},-0.0001,1e-7,1e22,123456789012])
 cases.push(fn('dumps',v),fn('hash',v));
for(const v of [csvText,'','\n','a,b','"','a,"b"c,d','x\n\ny\r\n','"multi\r\nline\r\n"\r\n','a\x00b,c\n','a\rb\n'])cases.push(fn('csv',v));
for(const v of [[{type:'error',code:'source_not_found'}],[{type:'result'},{type:'error',code:'rate_limited'},{type:'error',code:'access_denied'}],[{type:'error',code:'other'}],[{type:'error'}],[],[{code:'invalid_request'}],[{type:'error',code:'authorization_required'}],[{type:'error',code:'invalid_request'}],[{type:'error',code:5}]])
 cases.push(fn('failure',v));

// normalize: Gmail threads, Calendar events, Notion pages and a generic source.
const header=(name:string,value:string)=>({name,value});
const message=(id:string,date:string,labels:string[]|undefined,payload:any,extra={})=>({id,internalDate:date,...(labels?{labelIds:labels}:{}),payload,...extra});
const thread={id:'t1',data:{userEmail:'me@example.com',thread:{id:'abc123',messages:[
 message('m1','1000',['INBOX','UNREAD','CATEGORY_PROMOTIONS'],{mimeType:'text/plain',headers:[header('Subject','Plans'),header('From','Alex <alex@example.com>'),header('Date','Mon, 5 Oct 2026')],body:{data:url64('Hello ünïcode')}},{picture:{src:'https://example.com/a.png'}}),
 message('m2','3000',['SENT'],{mimeType:'multipart/alternative',headers:[header('Subject','Re: Plans')],parts:[{mimeType:'text/html',body:{data:url64('<p>Sure &amp; thanks</p>')}}]},{picture:{src:'https://example.com/me.png'}}),
 message('m3','2000',['SPAM'],{mimeType:'multipart/mixed',parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:url64('Inner plain')}},{mimeType:'text/html',body:{data:url64('<b>x</b>')}}]},{mimeType:'application/pdf',filename:'a.pdf',body:{}}]},{excerptTruncated:false}),
 message('m4','2000',undefined,{headers:[header('subject','No body')]},{snippet:'It&#39;s &quot;here&quot;'}),
]}}};
const many={id:'thread:t9',data:{threadId:'t9'}};
const longThread={id:'t2',data:{thread:{messages:Array.from({length:10},(_,i)=>message('n'+i,String(i),['INBOX'],{mimeType:'text/plain',body:{data:url64('x'.repeat(i===3?13000:10))}})),messagesOmitted:0}}};
for(const unreadOnly of [false,true])cases.push({kind:'normalize',provider:'gmail',result:{records:[thread,longThread,many,{id:'thread:solo',data:{id:'solo',labelIds:['TRASH'],payload:{mimeType:'text/plain',body:{data:'SGk'}},internalDate:'5'}},
 {id:'thread:p',data:{labelIds:['INBOX'],payload:{mimeType:'text/html',parts:[{mimeType:'text/html',body:{data:url64('<div>Caf&eacute; &copy 2026 &notit;</div>')}}]}}},
 {id:'thread:x',data:{thread:{messages:[message('a','1',['SPAM'],{}),message('b','2',['TRASH','UNREAD'],{body:{data:'-_-_'}})]}}}],unreadOnly,metadataOnly:1}});
cases.push({kind:'normalize',provider:'gmail',result:{records:[{id:'thread:bad',data:{payload:{mimeType:'text/plain',body:{data:'A'}}}}]}},
 {kind:'normalize',provider:'gmail',result:{records:[{id:'thread:bad',data:{payload:{mimeType:'text/plain',body:{data:'AB=x'}}}}]}},
 {kind:'normalize',provider:'gmail',result:{records:[{id:'thread:bin',data:{payload:{mimeType:'text/plain',body:{data:b64(new Uint8Array([0xef,0xbb,0xbf,0x61,0xc3,0x28,0xed,0xa0,0x80]))}}}}]}});
const event=(id:string,data:any)=>({id,data:{id,...data}});
cases.push({kind:'normalize',provider:'google-calendar',result:{records:[
 event('e1',{summary:'Planning',htmlLink:'https://calendar.example.com/e1',start:{dateTime:'2026-10-09T09:00:00-07:00',timeZone:'America/Los_Angeles'},end:{dateTime:'2026-10-09T10:00:00-07:00'},status:'confirmed',location:'Room 2',attendees:[{email:'alex@example.com',self:true,responseStatus:'accepted'}],description:'Agenda'}),
 event('e2',{summary:null,start:{date:'2026-10-10'},end:{date:'2026-10-11'},attendees:[{self:true,responseStatus:'declined'}]}),
 event('e3',{status:'cancelled',start:{},end:{}}),event('e4',{title:'Titled',summary:'Ignored',attendees:[{self:false},{self:1,responseStatus:'tentative'}],start:{dateTime:'x',date:'y'}}),
 event('e5',{summary:7,description:'d'.repeat(12100)})],scope:'Next'}},
 {kind:'normalize',provider:'notion',result:{pages:[{id:'n1',data:{title:'Doc',url:'https://notion.example.com/n1',markdown:'# Doc\nBody'}},{id:'n2',title:'Index only'},{id:'n3',data:{markdown:'m'.repeat(12001)}},{id:'n4',data:{markdown:'short',partial:true}},{id:'n5',data:{markdown:5}}]}},
 {kind:'normalize',provider:'linear',result:{records:[{id:'l1',data:{title:'Issue',url:'https://example.com/l1',z:['a',{y:'b',x:'c'}],n:1,b:true,s:null}},{id:'l2',summary:'Sum'},{id:'l3'}],metadataOnly:[]}},
 {kind:'normalize',provider:'linear',result:{records:Array.from({length:55},(_,i)=>({id:'r'+i,data:{text:'t'.repeat(i===54?20000:i)}}))}},
 ...[{error:'boom',records:[]},{ok:false,records:[]},{records:{}},{},{records:[{id:''}]},{records:[{data:{}}]},{records:[{id:5}]},{ok:true,error:'',records:[]},{records:null,pages:[]}].map(result=>({kind:'normalize',provider:'notion',result})));

// Mail: prepare, then send and reconcile with receipts.
const PROFILE='gmail/v1/users/me/profile',me={[PROFILE]:{emailAddress:'me@example.com'}};
const replyThread=(messages:any[])=>({...me,'gmail/v1/users/me/threads/ab12':{messages}});
const tmsg=(date:string,headers:[string,string][])=>({internalDate:date,payload:{headers:headers.map(([name,value])=>({name,value}))}});
const trip=replyThread([tmsg('1',[['From','Alex <alex@example.com>'],['Subject','Trip'],['Message-ID','<one@example.com>']]),
 tmsg('5',[['From','Sam Example <sam@example.com>'],['Reply-To','"Example, Sam" <sam.reply@example.com>'],['Cc','Alex <alex@example.com>, Kim <kim@example.com>'],['Subject','Re: Trip'],['Message-ID','<two@example.com>'],['References','<one@example.com>']]),
 tmsg('3',[['From','me@example.com'],['To','alex@example.com']])]);
for(const [args,routes] of [
 [{to:'Sam <sam@example.com>',subject:'Hello',body:'Hi Sam'},me],[{to:'sam@example.com',body:'No subject'},me],[{to:'me@example.com',subject:'Self',body:'Note'},me],[{subject:'Self',body:'Note'},me],
 [{to:'sam@example.com',subject:'a\nb',body:'x'},me],[{to:'sam@example.com',subject:'s'.repeat(301),body:'x'},me],[{to:'sam@example.com',subject:'é'.repeat(300),body:'x'},me],[{to:'sam@example.com',body:''},me],
 [{to:'sam@example.com',body:'b'.repeat(30001)},me],[{to:'sam@example.com',body:5},me],[{to:'sam@example.com',subject:null,body:'x'},me],[{to:'Alex',body:'x'},me],
 [{to:'one@example.com,two@example.com',body:'x'},me],[{to:'sam@example.com',body:'x'},{[PROFILE]:{emailAddress:'Not An Address'}}],
 [{threadId:'thread:ab12',subject:'ignored',body:'Hi Sam, see you there.'},trip],[{threadId:'live:gmail:ab12',body:'Hello there, see you.'},trip],
 [{threadId:'ab12',body:'Hi Kim, wrong person.'},trip],[{threadId:'ab12',to:'kim@example.com',body:'Hi Kim'},trip],[{threadId:'ab12',to:'Alex <ALEX@example.com>',body:'Hi Al'},trip],
 [{threadId:'ab12',to:'pat@example.com',body:'x'},trip],[{threadId:'ab12',to:'pat@example.com',body:'x'},replyThread([tmsg('1',[['From','Alex <alex@example.com>']])])],
 [{threadId:'ab12',sourceIds:['thread:cd34','live:gmail:ef56','note:1',7],body:'x'},trip],[{threadId:'ab12',sourceIds:['thread:ab12'],body:'Thanks.'},trip],[{threadId:'ab12',sourceIds:'thread:cd34',body:'Thanks.'},trip],
 [{threadId:'ab12',sourceIds:{'thread:cd34':1},body:'Thanks.'},trip],[{threadId:'zz',body:'x'},trip],[{threadId:null,body:'x',to:'sam@example.com'},me],[{threadId:'a'.repeat(65),body:'x'},trip],
 [{threadId:'ab12',body:'x'},replyThread([])],[{threadId:'ab12',body:'x'},me],[{threadId:'ab12',body:'Thanks'},replyThread([tmsg('9',[['From','Me <me@example.com>'],['Subject','Mine']])])],
 [{threadId:'ab12',to:'me@example.com',body:'Thanks'},replyThread([tmsg('9',[['From','Me <me@example.com>'],['Subject','Mine']])])],
 [{threadId:'ab12',body:'Thanks'},replyThread([tmsg('9',[['From','alex@example.com'],['Message-ID','<a@b>\r\nBcc: x']])])],
 [{threadId:'ab12',body:'Thanks',subject:'Fallback'},replyThread([tmsg('9',[['from','alex@example.com'],['References','<r@x> '.repeat(400)]]),tmsg('9',[['From','sam@example.com']])])],
] as [any,any][])cases.push({kind:'prepare',args,routes});

const ID='6f1c2a8e-0000-4000-8000-00000000a11e',draft={from:'me@example.com',to:'sam@example.com',subject:'Hello',body:'Hi Sam,\nSee you.'};
const sent={'gmail/v1/users/me/messages/send':{id:'m-1',threadId:'t-1'},...me};
const bodies=['Plain ASCII.','Héllo — café\r\nsecond line\rthird','x'.repeat(100)+' \n'+'y'.repeat(76)+'\t\n=end=',('Long line with ünïcode '.repeat(5)+'\n').repeat(12),'東京の天気。'.repeat(20),
 ('a'.repeat(75)+'=b').repeat(3)+'\n'+'c'.repeat(77)+' ','\x0b\x0c\x1c\x85 line\n\n\n','From the start\n.\n','é'+'x'.repeat(78),'a'.repeat(80)+'\n'.repeat(12)];
for(const body of bodies)cases.push({kind:'send',draft:{...draft,body},id:ID,routes:sent});
for(const subject of ['','Café plans','Re: 東京 trip — 日程 ok','x'.repeat(90)+' end','word '.repeat(30),'  leading','a  b','=?utf-8?q?encoded?=','tab\there','é'.repeat(80)])
 cases.push({kind:'send',draft:{...draft,subject},id:ID,routes:sent});
const reply={...draft,threadId:'ab12',inReplyTo:'<two@example.com>',references:'<one@example.com>'};
cases.push({kind:'send',draft:reply,id:ID.toUpperCase(),routes:sent},{kind:'send',draft:{...reply,references:''},id:ID,routes:sent},
 {kind:'send',draft:{...reply,references:'<r@example.com> '.repeat(120).trim(),inReplyTo:'<'+'z'.repeat(1990)+'@example.com>'},id:ID,routes:sent},
 {kind:'send',draft:{...draft,to:'Sam <sam@example.com>'},id:ID,routes:sent},{kind:'send',draft:{...draft,to:'josé@exämple.com',from:'Me <ME@example.com>'},id:ID,routes:sent},
 {kind:'send',draft:{...draft,subject:'a\r\nBcc: x@example.com'},id:ID,routes:sent},{kind:'send',draft:{...draft,inReplyTo:'<a@b>\nBcc: x'},id:ID,routes:sent},
 {kind:'send',draft:{...draft,from:'other@example.com'},id:ID,routes:sent},{kind:'send',draft,id:ID,routes:{...me,'gmail/v1/users/me/messages/send':{threadId:'t'}}},
 {kind:'send',draft:{...draft,to:'Alex'},id:ID,routes:sent});
for(const id of ['not-a-uuid','{'+ID+'}','urn:uuid:'+ID,ID.replaceAll('-',''),'z'.repeat(32),'-'+'0'.repeat(31),'-'+'1'.repeat(31),'+'+'1'.repeat(31),'0x'+'1'.repeat(30),' '+'1'.repeat(31),'1_'+'1'.repeat(30),5,null])
 cases.push({kind:'send',draft,id,routes:sent},{kind:'reconcile',draft,id,routes:sent});
const hash=await draftHash(draft),rfc='<1.2.3.'+ID+'@worldlet.local>',pending={status:'sending',sender:'me@example.com',draftHash:hash,rfcMessageId:rfc};
const search=(found:any)=>({...me,'gmail/v1/users/me/messages':{messages:[{id:'skip'},{id:'s 1'}]},'gmail/v1/users/me/messages/skip':{id:'skip',labelIds:['SENT'],payload:{headers:[header('Message-ID','<other@x>')]}},'gmail/v1/users/me/messages/s%201':found});
const match={id:'s 1',threadId:'t-9',labelIds:['SENT'],payload:{headers:[header('Message-ID',rfc),header('From','Me <me@example.com>'),header('To','sam@example.com')]}};
for(const kind of ['send','reconcile'])cases.push(
 {kind,draft,id:ID,routes:me},
 {kind,draft,id:ID,receipts:{[ID]:{...pending,status:'sent',ok:true,messageId:'old'}},routes:me},
 {kind,draft,id:ID,receipts:{[ID]:{...pending,draftHash:'changed'}},routes:me},
 {kind,draft,id:ID,receipts:{[ID]:{...pending,sender:'other@example.com'}},routes:me},
 {kind,draft,id:ID,receipts:{[ID]:{...pending,rfcMessageId:'missing'}},routes:me},
 {kind,draft,id:ID,receipts:{[ID]:pending},routes:{...me,'gmail/v1/users/me/messages':{}}},
 {kind,draft,id:ID,receipts:{[ID]:pending},routes:search(match)},
 {kind,draft,id:ID,receipts:{[ID]:pending},routes:search({...match,labelIds:['INBOX']})},
 {kind,draft,id:ID,receipts:{[ID]:pending},routes:search({...match,payload:{headers:[header('Message-ID',rfc),header('From','other@example.com'),header('To','sam@example.com')]}})},
 {kind,draft,id:ID,receipts:{[ID]:pending},routes:search({...match,payload:{headers:[header('Message-ID',rfc),header('From','me@example.com'),header('To','Alex')]}})},
 {kind,draft:{...draft,from:'other@example.com'},id:ID,receipts:{[ID]:pending},routes:me});

// Both sides, then the sent messages as Python's email parser reads them.
const expected=python('cases',cases),actual=await Promise.all(cases.map(port));
const raws=(entries:any[])=>entries.flatMap(e=>e.calls.filter((c:any)=>c[0]==='POST'&&c[3]?.raw).map((c:any)=>c[3]));
const parsed=python('mime',[...raws(expected),...raws(actual)].map(b=>b.raw));
for(const body of [...raws(expected),...raws(actual)]){body.raw=parsed.shift();}
for(const e of actual)for(const c of e.calls)if(c[0]==='POST'&&c[3]?.raw){
 const id=c[3].raw.headers.find(([k]:string[])=>k==='Message-ID')[1];
 assert.equal(e.value?.rfcMessageId??Object.values(e.receipts)[0]?.['rfcMessageId'],id,'the receipt records the sent Message-ID');
}
const messageId=(v:any):any=>typeof v==='string'?v.replace(/^<\d+(?:\.\d+)+\.([^@<>]+)@worldlet\.local>$/,'<id.$1@worldlet.local>'):Array.isArray(v)?v.map(messageId):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,messageId(x)])):v;
const failures:any[]=[];
cases.forEach((c,i)=>{
 const label=JSON.stringify(c).slice(0,300);
 if(c.errorOnly){assert.ok(expected[i].error&&actual[i].error,label);return;}
 try{assert.deepEqual(messageId(actual[i]),messageId(expected[i]),label);}catch(e){failures.push(e);}
});
if(failures.length){for(const f of failures.slice(0,Number(process.env.SHOW??3)))console.error(f.message.slice(0,3000));throw new Error(failures.length+' fixtures differ');}
// Guard against a vacuous pass: both answers and failures are exercised, and every body transfer encoding is sent.
const ok=expected.filter((e:any)=>!('error' in e)).length;
assert.ok(ok>150&&cases.length-ok>100,`answers ${ok}, failures ${cases.length-ok}`);
assert.deepEqual([...new Set(raws(expected).map((b:any)=>b.raw.cte))].sort(),['7bit','8bit','base64','quoted-printable']);
const entities=python('entities',null),table=htmlEntities();
assert.equal(table.size,Object.keys(entities).length);
for(const [name,value] of Object.entries(entities))assert.equal(table.get(name),value,name);
console.log(`PASS Google accounts parity: ${cases.length} fixtures of drive_reader, host.py Calendar/Drive reads, mail_actions and source_reader answer the same in core/accounts (results, errors, REST calls, receipts, parsed MIME), and ${table.size} HTML entities match.`);
