import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MCP_POLICY,READ_SHAPED,fnmatchcase,mcpConfiguration,enabledMcpTools,mcpPayload,jsonSchemaValid,notion,notionPageId,
 NOTION_GATE,TODOIST_GATE,LINEAR_GATE,PAYPAL_GATE,SUPABASE_GATE,todoist,todoistTimeoutSeconds,readLinear,readPaypal,readSupabase,McpValueError,
 type McpGate,type McpSession,type McpToolResult,type NotionReviewStore} from '../core/accounts/index.ts';
import {OSError} from '../core/accounts/mcp/python.ts';
// The World's MCP connector readers (core/accounts/mcp) answer exactly what the Hermes Python they replace answered:
// notion_mcp (with notion_writes), todoist_mcp, linear_mcp, paypal_mcp, supabase_mcp and mcp_session.mcp_payload run
// through their `read(body)` with a fake connected_session, and the ports with an equivalent fake McpSession, on the
// same scripted tool answers. Results, error messages and kinds, tool calls (name, arguments, read timeout), the
// connect gate each Python reader asked for, and the Notion review files on disk must all match. host.py's MCP_POLICY,
// READ_SHAPED and its configure checks (endpoint, tool filter, required tools) are compared too. Fictional data only.

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PYTHON=String.raw`
import ast, asyncio, copy, fnmatch, json, os, sys, tempfile, types, uuid as real_uuid
from pathlib import Path
NS = types.SimpleNamespace
sys.path.insert(0, sys.argv[1] + '/harness/hermes')
try:
    if os.environ.get('WORLDLET_WITHOUT_JSONSCHEMA'): raise ImportError('rehearsing a Python without jsonschema')
    import jsonschema
    SCHEMA = 'jsonschema ' + __import__('importlib.metadata').metadata.version('jsonschema')
except ImportError:
    # Without jsonschema the Notion write flows check their candidates with this subset (the keywords their fixture
    # schemas use); the schema truth table then compares the port with its recorded expectations only.
    SCHEMA = None
    class ValidationError(Exception): pass
    def valid(v, s):
        if s is True or s is False: return s
        kinds = {'object': dict, 'array': list, 'string': str, 'boolean': bool, 'null': type(None)}
        if 'type' in s:
            ts = s['type'] if isinstance(s['type'], list) else [s['type']]
            def is_type(t):
                if t in ('number', 'integer'): return isinstance(v, (int, float)) and not isinstance(v, bool) and (t == 'number' or float(v).is_integer())
                return isinstance(v, kinds[t])
            if not any(is_type(t) for t in ts): return False
        if 'enum' in s and v not in s['enum']: return False
        if 'const' in s and v != s['const']: return False
        if 'anyOf' in s and not any(valid(v, x) for x in s['anyOf']): return False
        if isinstance(v, dict):
            if any(k not in v for k in s.get('required', [])): return False
            for k, x in v.items():
                if k in s.get('properties', {}):
                    if not valid(x, s['properties'][k]): return False
                elif 'additionalProperties' in s and not valid(x, s['additionalProperties']): return False
        if isinstance(v, list):
            if 'minItems' in s and len(v) < s['minItems']: return False
            if 'items' in s and not all(valid(x, s['items']) for x in v): return False
        return True
    def validate(v, s):
        if not valid(v, s): raise ValidationError('invalid')
    sys.modules['jsonschema'] = NS(validate=validate, ValidationError=ValidationError)
import mcp_session, notion_mcp, notion_writes, todoist_mcp, linear_mcp, paypal_mcp, supabase_mcp
MODULES = {'notion': notion_mcp, 'todoist': todoist_mcp, 'linear': linear_mcp, 'paypal': paypal_mcp, 'supabase': supabase_mcp}

def result_of(answer):
    if 'raise' in answer: raise RuntimeError(answer['raise'])
    if 'json' in answer: return NS(isError=False, content=[NS(type='text', text=json.dumps(answer['json']))], structuredContent=None)
    r = answer['result']
    return NS(isError=r.get('isError', False), content=[NS(**p) for p in r.get('content', [])], structuredContent=r.get('structuredContent'))

class Session:
    def __init__(s, case): s.answers, s.tools, s.calls = copy.deepcopy(case.get('answers', {})), case.get('tools', []), []
    async def call_tool(s, name, args, read_timeout_seconds=None):
        s.calls.append([name, copy.deepcopy(args), read_timeout_seconds])
        queue = s.answers.get(name)
        if not queue: raise RuntimeError('No scripted answer for ' + name)
        return result_of(queue.pop(0) if len(queue) > 1 else queue[0])
    async def list_tools(s):
        s.calls.append(['$list_tools'])
        if isinstance(s.tools, dict): raise RuntimeError(s.tools['raise'])
        return NS(tools=[NS(**t) for t in s.tools])

def kind(error):
    for name, cls in (('ValueError', ValueError), ('OSError', OSError), ('RuntimeError', RuntimeError)):
        if isinstance(error, cls): return name
    return 'TypeError'

def flow(case):
    session, gates, clock, ids = Session(case), [], [0], list(case.get('uuids', []))
    def connected(name, urls, connect_msg, url_msg, disconnected_msg, include=None, bearer=False):
        gate = {'name': name, 'urls': sorted(urls), 'connectMessage': connect_msg, 'urlMessage': url_msg, 'disconnectedMessage': disconnected_msg, 'include': include, 'bearer': bearer, 'timeoutSeconds': None}
        gates.append(gate)
        def run(work, timeout):
            gate['timeoutSeconds'] = timeout
            return asyncio.run(work())
        return session, run
    for module in (mcp_session, todoist_mcp, linear_mcp, supabase_mcp): module.connected_session = connected
    notion_writes.time = NS(time=lambda: clock[0])
    notion_writes.uuid = NS(UUID=real_uuid.UUID, uuid4=lambda: real_uuid.UUID(ids.pop(0)))
    with tempfile.TemporaryDirectory() as temporary:
        home = Path(temporary); os.environ['HERMES_HOME'] = str(home)
        folder = home / 'worldlet-notion-reviews'
        if 'files' in case:
            folder.mkdir()
            for name, text in case['files'].items(): (folder / name).write_text(text)
        steps = []
        for step in case['steps']:
            clock[0] = float(step.get('now', 1791000000.25))  # time.time() is always a float
            try:
                entry = {'value': MODULES[case['module']].read(step['body'])}
                if isinstance(entry['value'], dict) and isinstance(entry['value'].get('reviews'), list): entry['value']['reviews'].sort(key=lambda r: str(r.get('id')))
            except Exception as error:
                entry = {'error': str(error).replace(str(home) + '/', ''), 'kind': kind(error)}
            steps.append(entry)
        files = {p.name: p.read_text() for p in sorted(folder.iterdir())} if folder.exists() else {}
    return {'steps': steps, 'calls': session.calls, 'gates': gates, 'files': files}

def host():
    tree = ast.parse(Path(sys.argv[1] + '/harness/hermes/host.py').read_text(encoding='utf-8'))
    keep = [n for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', None) in ('READ_SHAPED', 'MCP_POLICY') or isinstance(n, ast.FunctionDef) and n.name == 'mcp']
    namespace = {'TODOIST_ENDPOINT': todoist_mcp.ENDPOINT, 'TODOIST_TOOLS': todoist_mcp.READ_TOOLS, 'SUPABASE_ENDPOINT': supabase_mcp.ENDPOINT, 'SUPABASE_TOOLS': supabase_mcp.READ_TOOLS, 'GOOGLE_MCP': {}, 'HERMES_DIR': None}
    exec(compile(ast.Module(body=keep, type_ignores=[]), 'host-mcp', 'exec'), namespace)
    return namespace

def configure(namespace, case):
    saved, probed = {}, case['probed']
    sys.modules['hermes_cli'] = NS()
    sys.modules['hermes_cli.mcp_config'] = NS(_get_mcp_servers=lambda: saved, _save_mcp_server=lambda name, cfg: saved.__setitem__(name, cfg),
        _probe_single_server=lambda name, cfg: [(t, 'A fictional tool') for t in probed], _reauth_oauth_server=lambda name, cfg: True,
        _remove_mcp_server=lambda name: None, _save_bearer_auth_token=lambda name, token: {'Authorization': 'Bearer ' + token}, _oauth_tokens_present=lambda name: True)
    try:
        return {'value': namespace['mcp']({'operation': 'configure', 'token': 'YOUR_API_KEY', **case['body']})}
    except Exception as error:
        return {'error': str(error), 'kind': kind(error)}

def fn(case):
    try:
        if case['fn'] == 'payload':
            kinds = tuple({'dict': dict, 'list': list}[k] for k in case['kinds'])
            return {'value': mcp_session.mcp_payload(result_of(case['answer']), 'Failed.', 'Unsupported.', kinds[0] if len(kinds) == 1 else kinds)}
        if case['fn'] == 'pageId': return {'value': notion_mcp.page_id(case['value'])}
        if case['fn'] == 'fnmatch': return {'value': fnmatch.fnmatchcase(case['name'], case['pattern'])}
        if case['fn'] == 'schema':
            if SCHEMA is None: return {'unavailable': True}
            try:
                jsonschema.validate(case['instance'], case['schema']); return {'value': True}
            except jsonschema.ValidationError: return {'value': False}
    except Exception as error:
        return {'error': str(error), 'kind': kind(error)}

cases, namespace, out = json.load(sys.stdin), host(), []
for case in cases:
    out.append(flow(case) if 'module' in case else configure(namespace, case) if 'probed' in case else fn(case))
print(json.dumps({'cases': out, 'policy': {'READ_SHAPED': namespace['READ_SHAPED'], 'MCP_POLICY': namespace['MCP_POLICY']}, 'schema': SCHEMA}, ensure_ascii=True))
`;
function python(input:unknown){
 const run=spawnSync('python3',['-I','-c',PYTHON,root],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:1<<28});
 assert.equal(run.status,0,run.stderr);
 return JSON.parse(run.stdout);
}

// The port, through the same scripted answers.
type Answer={json?:unknown;result?:McpToolResult;raise?:string};
const resultOf=(answer:Answer):McpToolResult=>{
 if(answer.raise!==undefined)throw new Error(answer.raise);
 if('json' in answer)return {isError:false,content:[{type:'text',text:JSON.stringify(answer.json)}],structuredContent:null};
 return structuredClone(answer.result);
};
class FakeSession implements McpSession {
 calls:any[]=[];answers:Record<string,Answer[]>;tools:any;
 constructor(c:any){this.answers=structuredClone(c.answers??{});this.tools=c.tools??[];}
 async callTool(name:string,args:Record<string,unknown>,timeoutSeconds?:number){
  this.calls.push([name,structuredClone(args),timeoutSeconds??null]);
  const queue=this.answers[name];
  if(!queue?.length)throw new Error('No scripted answer for '+name);
  return resultOf(queue.length>1?queue.shift():queue[0]);
 }
 async listTools(){
  this.calls.push(['$list_tools']);
  if(!Array.isArray(this.tools))throw new Error(this.tools.raise);
  return {tools:structuredClone(this.tools)};
 }
}
class Store implements NotionReviewStore {
 files=new Map<string,string>();
 list(){return [...this.files.keys()];}
 read(name:string){return this.files.get(name)??null;}
 exists(name:string){return this.files.has(name);}
 write(name:string,text:string){this.files.set(name,text);}
 create(name:string){if(this.files.has(name))return false;this.files.set(name,'');return true;}
 delete(name:string){assert.ok(this.files.delete(name),'deletes an existing review');}
}
const kind=(error:any)=>error instanceof McpValueError?'ValueError':error instanceof OSError?'OSError':error instanceof TypeError?'TypeError':'RuntimeError';
const GATES:Record<string,McpGate>={notion:NOTION_GATE,todoist:TODOIST_GATE,linear:LINEAR_GATE,paypal:PAYPAL_GATE,supabase:SUPABASE_GATE};
const plainGate=(gate:McpGate,timeoutSeconds:number)=>({name:gate.name,urls:[...gate.urls].sort(),connectMessage:gate.connectMessage,urlMessage:gate.urlMessage,
 disconnectedMessage:gate.disconnectedMessage,include:gate.include&&[...gate.include],bearer:gate.bearer,timeoutSeconds});
async function port(c:any){
 if(c.module){
  const session=new FakeSession(c),store=new Store(),steps:any[]=[],gates:any[]=[],ids=[...c.uuids??[]];
  for(const [name,text] of Object.entries(c.files??{}))store.write(name,text as string);
  for(const step of c.steps){
   const now=step.now??1791000000.25,body=step.body,options={now:()=>now,uuid:()=>ids.shift()};
   const gate=GATES[c.module];
   gates.push(plainGate(gate,c.module==='todoist'?todoistTimeoutSeconds(body):gate.timeoutSeconds));
   const called=session.calls.length;
   try{
    const value:any=await (c.module==='notion'?notion(session,body,store,options):c.module==='todoist'?todoist(session,body)
     :c.module==='linear'?readLinear(session,body):c.module==='paypal'?readPaypal(session,body):readSupabase(session,body));
    steps.push({value:JSON.parse(JSON.stringify(value))});
   }catch(error){
    steps.push({error:error.message,kind:kind(error)});
    // Python routes on the operation before it starts the bounded run, so an unroutable one never gets its timeout.
    if(/^unhashable type/.test(error.message)&&session.calls.length===called)gates.at(-1).timeoutSeconds=null;
   }
  }
  return {steps,calls:session.calls,gates,files:Object.fromEntries([...store.files].sort(([a],[b])=>a<b?-1:1))};
 }
 try{
  if(c.probed){
   const config=mcpConfiguration(String(c.body.name??''),c.body.url??'');
   return {value:{ok:true,tools:enabledMcpTools(c.body.name,c.probed,config.tools.include),status:'connected'}};
  }
  if(c.fn==='payload')return {value:mcpPayload(resultOf(c.answer),'Failed.','Unsupported.',c.kinds)};
  if(c.fn==='pageId')return {value:notionPageId(c.value)};
  if(c.fn==='fnmatch')return {value:fnmatchcase(c.name,c.pattern)};
  if(c.fn==='schema')return {value:jsonSchemaValid(c.instance,c.schema)};
 }catch(error){return {error:error.message,kind:kind(error)};}
}

// Fixtures: fictional workspaces, tasks, issues, invoices and projects.
const J=(json:unknown):Answer=>({json}),R=(result:McpToolResult):Answer=>({result}),X=(raise:string):Answer=>({raise});
const T=(text:unknown)=>({type:'text',text} as any);
const cases:any[]=[];
const read=(module:string,bodies:any[],answers:Record<string,Answer[]>={},extra:any={})=>cases.push({module,steps:bodies.map(body=>({body})),answers,...extra});
const scenario=(module:string,steps:any[],answers:Record<string,Answer[]>={},extra:any={})=>cases.push({module,steps,answers,...extra});

// mcp_payload, with dict and dict-or-list kinds.
for(const kinds of [['dict'],['dict','list']])for(const answer of [
 R({structuredContent:{a:1},content:[T('[1]')]}),R({structuredContent:[1,2],content:[T('[3]'),T('{"b":2}')]}),R({isError:true,structuredContent:{a:1}}),
 R({content:[T(''),T('not json'),T('5'),T('"text"'),T('{"c":3}')]}),R({content:[T('[]')]}),R({content:[{type:'image'},T(null),T('{"d":"é"}')]}),R({content:[]}),
 R({content:[T('{"x":1} trailing')]}),R({content:[T(' {"padded":true} ')]}),R({structuredContent:'text',content:[T('{"e":1}')]}),J({f:[1,{g:null}]}),J([1,2]),X('Transport closed.')])
 cases.push({fn:'payload',kinds,answer});

// Notion page IDs and URLs.
const P='1a2b3c4d5e6f40718293a4b5c6d7e8f9',Q='0f1e2d3c4b5a49687786a5b4c3d2e1f0',DASHED='1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9';
for(const value of [P,P.toUpperCase(),DASHED,' '+P+'\n','https://www.notion.so/Plan-'+P,'https://www.notion.so/team/Plan-'+P+'?pvs=4#'+Q,'https://example.notion.site/'+P,
 'https://notion.com/p/'+DASHED,'https://notion.so/'+P+'/'+Q,'https://notion.so/'+P+';'+Q,'https://www.notion.so/x;'+Q,'http://www.notion.so/'+P,'https://evilnotion.so/'+P,
 'https://notion.so.example.com/'+P,'https://alex@notion.so/'+P,'https://:secret@notion.so/'+P,'https://@notion.so/'+P,'https://NOTION.SO/'+P,'https://www.notion.so:443/'+P,
 'HTTPS://www.notion.so/'+P,'https://www.notion.so/no-id','https://www.notion.so/?p='+P,'notion.so/'+P,'','-'.repeat(32),'g'.repeat(32),'\x01https://notion.so/'+P,
 'https://www.no\ttion.so/'+P,'https://[::1]/'+P,'https://[notion.so]/'+P,'https://[192.0.2.10]/'+P,'https://[::1/'+P,'https://notion.so]/'+P,'https://[v1.x]/'+P,
 'https://x[::1]/'+P,'https://[::1]x/'+P,'https://ｎotion.so/'+P,'https://notion.so／@x/'+P,P.slice(0,31),P+'0',null,5,['x'],{id:P}])
 cases.push({fn:'pageId',value});

// Notion reads.
const fetched=(title:string,body:string,extra:any={},at='10:00')=>({title,text:`Here is the result of "fetch" at 2026-10-09T${at}:00Z\n<page url="https://www.notion.so/${P}">\n<properties>{"title":"${title}"}</properties>\n<content>\n${body}\n</content>\n</page>`,metadata:{type:'page'},page_last_edited_at:'2026-10-08T09:00:00.000Z',...extra});
const recent=(rows:any[],extra:any={})=>({'notion-list-recent-pages':[J({results:rows,...extra})]});
read('notion',[{operation:'list'}],recent([{id:P,title:'Trip **plan** &amp; notes',type:'page'},{url:'https://www.notion.so/Dup-'+P,title:'Duplicate'},{id:'bad'},{url:'https://example.com/'+Q,title:'Elsewhere'},
 {id:Q,title:'<mention-date start="2026-10-10" startTime="09:00"/> Standup __x__',type:'database'},{id:DASHED.replace('1a','2a'),title:null},{id:'3'+P.slice(1),title:7},{id:'4'+P.slice(1),title:['a']}],{nextCursor:'n2'}));
read('notion',[{operation:'list'}],recent(Array.from({length:25},(_,i)=>({id:String(i).padStart(2,'0')+P.slice(2),title:'Page '+i})),{nextCursor:''}));
read('notion',[{operation:'list'}],recent([P,{id:P}]));
read('notion',[{operation:'list'}],{'notion-list-recent-pages':[J({results:{}})]});
read('notion',[{operation:'list'}],{'notion-list-recent-pages':[J([1])]});
read('notion',[{operation:'list'}],{'notion-list-recent-pages':[R({isError:true,content:[T('{"results":[]}')]})]});
read('notion',[{operation:'list'}],{'notion-list-recent-pages':[R({content:[T('[1]'),T('{"results":[]}')]})]});
read('notion',[{operation:'list'}],{'notion-list-recent-pages':[R({structuredContent:{results:[]},content:[T('nope')]})]});
read('notion',[{operation:'list'}],{'notion-list-recent-pages':[X('Notion timed out.')]});
read('notion',[{operation:'move'},{},{operation:null},{operation:['list']},{operation:{a:1}}]);
const fetchOne=(value:any,body:any={operation:'fetch',id:P},more:Record<string,Answer[]>={})=>read('notion',[body],{'notion-fetch':[J(value)],...more});
fetchOne(fetched('Plan','# Plan\n\nSee <page url="https://www.notion.so/'+Q+'">Other **page**</page> and <mention-page url="https://www.notion.so/'+Q+'"/> on <mention-date start="2026-10-12"/>.\n<mention-page url="https://www.notion.so/x">multi\nline</mention-page>'));
fetchOne(fetched('Plan','# Plan'),{operation:'fetch',id:'https://www.notion.so/Plan-'+P});
fetchOne({title:'Blank',text:'<page><blank-page>This page is blank</blank-page></page>',metadata:{type:'page'}});
fetchOne({title:'Index only',text:'<page><properties>{}</properties></page>'});
fetchOne({title:'No text'});fetchOne({title:'List text',text:['x']});fetchOne({text:'<content>x</content>',metadata:null});
fetchOne({text:'<content>x</content>',metadata:{type:['page']}});fetchOne({text:'<content>x</content>',metadata:{type:{}}});
fetchOne(fetched('Long','x'.repeat(160_001)));fetchOne(fetched('Exact','é'.repeat(160_000)));fetchOne(fetched('Truncated','a',{truncated:true}));
fetchOne(fetched('Unknown','<unknown url="x"/> b',{unknown_block_count:0}));fetchOne(fetched('Unknownish','<unknowns/> b'));fetchOne(fetched('Marked','<callout truncated="true">a</callout>'));
fetchOne(fetched('','  spaced  ',{page_last_edited_at:null}));fetchOne(fetched('Title &lt;b&gt;','<content>nested</content>'));
read('notion',[{operation:'fetch',id:'https://example.com/'+P},{operation:'fetch'},{operation:'fetch',id:''}]);
const SOURCE='collection://'+Q,SOURCE2='collection://'+DASHED;
const state=(schema:any)=>'<data-source-state>'+JSON.stringify({schema})+'</data-source-state>';
const SCHEMA={Name:{type:'title'},Status:{type:'status'},Due:{type:'date'},Priority:{type:'select'},Points:{type:'number'},Done:{type:'checkbox'},Extra:{type:'select'}};
const database=(text:string,rows:any,extra:any={})=>fetchOne({title:'Tasks',text,metadata:{type:'database'}},undefined,{'notion-query-data-sources':[J({results:rows,...extra})]});
const row=(id:string,data:any)=>({url:'https://www.notion.so/'+id,...data});
database(`<database><data-source url="${SOURCE}">${state(SCHEMA)}</data-source></database>`,[row(P,{Name:'Book | court',Status:'In progress',Priority:{name:'High'},Points:3,Done:true}),
 row(Q,{Name:[{plain_text:'Rich'},{text:{content:' text'}}],Status:{plain_text:'Done'},Priority:null,Points:2.5,Done:false}),{url:'not-a-page',Name:'Skipped'},row('5'+P.slice(1),{title:'Fallback\ntitle'})],{has_more:false});
database(`<data-source url="${SOURCE}"></data-source><data-source url="${SOURCE2}"></data-source>`,[row(P,{Name:'One'})]);
database(`<data-source url="${SOURCE}"></data-source>`,Array.from({length:21},(_,i)=>row(String(i).padStart(2,'0')+P.slice(2),{Name:'Row '+i})));
database(`<data-source url="${SOURCE}"><data-source-state>{not json</data-source-state>`,[row(P,{Name:'One',title:'T'})],{has_more:true});
database(`<data-source url="${SOURCE}"><data-source-state>[1]</data-source-state>`,[]);
database(`<data-source url="${SOURCE}"><data-source-state>{"schema":[]}</data-source-state>`,[]);
database(`<data-source url="${SOURCE}"><data-source-state>{"schema":{"A":{"type":"title"},"B":"bad"}}</data-source-state>`,[]);
database(`<data-source url="${SOURCE}"><data-source-state>{"schema":{"A":{"type":["status"]}}}</data-source-state>`,[]);
database(`<data-source url="${SOURCE}"><data-source-state>{"schema":{"Name":{"type":"title"},"Tag":{"type":"select"}}}</data-source-state>`,[row(P,{Name:{name:7},Tag:{text:'plain'}})]);
database(`<data-source url="${SOURCE}"></data-source>`,{});
database(`<data-source url="${SOURCE}"></data-source>`,['not a row']);
database('<database>no sources <data-sources url="'+SOURCE+'"/></database>',[]);
fetchOne({title:'Source',text:`<data-source url="${SOURCE}">`,metadata:{type:'data_source'}},undefined,{'notion-query-data-sources':[R({isError:true})]});

// Notion reviewed writes, end to end with the review folder.
const BINDING='notion:alex-workspace',ID1='6f1c2a8e-0000-4000-8000-00000000a11e',ID2='6f1c2a8e-0000-4000-8000-00000000b22f',ID3='6f1c2a8e-0000-4000-8000-00000000c33a';
const NEW='9e8d7c6b5a4940398877665544332211';
const CREATE_SCHEMA={$schema:'http://json-schema.org/draft-07/schema#',type:'object',properties:{parent:{type:'object',properties:{page_id:{type:'string'}},required:['page_id'],additionalProperties:false},
 pages:{type:'array',minItems:1,items:{type:'object',properties:{properties:{type:'object'},content:{type:'string'}},required:['properties']}},allow_async:{type:'boolean'}},required:['parent','pages'],additionalProperties:false};
const UPDATE_SCHEMA={type:'object',properties:{page_id:{type:'string'},command:{type:'string',enum:['insert_content','replace_content']},new_str:{type:'string'},allow_async:{type:'boolean'}},required:['page_id','command'],additionalProperties:false};
const WRAPPED={type:'object',properties:{data:{anyOf:[UPDATE_SCHEMA,{type:'null'}]}},required:['data'],additionalProperties:false};
const TOOLS=[{name:'notion-fetch',inputSchema:{type:'object'}},{name:'notion-create-pages',inputSchema:CREATE_SCHEMA},{name:'notion-update-page',inputSchema:UPDATE_SCHEMA}];
const draft=(extra:any={})=>({operation:'create',target:P,title:'Packing list',markdown:'- Tent\n- Stove',...extra});
const step=(body:any,now?:number)=>({body:{binding:BINDING,...body},...(now===undefined?{}:{now})});
const prepare=(extra:any={},now?:number)=>step({operation:'prepare',draft:draft(extra)},now);
const act=(operation:string,id=ID1,now?:number)=>step({operation,id},now);
const before=fetched('Trip','# Trip\n\n- Tent'),after=fetched('Trip','# Trip\n\n- Tent\n\n- Tent\n- Stove',{},'10:05');
const write=(module:string,steps:any[],answers:Record<string,Answer[]>,extra:any={})=>scenario(module,steps,answers,{tools:TOOLS,uuids:[ID1,ID2,ID3],...extra});
write('notion',[prepare(),act('commit'),act('check'),act('commit'),step({operation:'reviews'}),act('discard'),step({operation:'reviews'}),act('check')],
 {'notion-fetch':[J(before),J(fetched('Trip','# Trip\n\n- Tent',{},'10:05')),J(fetched('Packing list','- Tent\n- Stove'))],'notion-create-pages':[J({pages:[{id:NEW,url:'https://www.notion.so/Packing-'+NEW}]})]});
write('notion',[prepare({operation:'append'}),act('commit'),act('check'),act('check')],{'notion-fetch':[J(before),J(before),J(after)],'notion-update-page':[J({pages:[{id:P}]})]});
write('notion',[prepare({operation:'append'}),act('commit'),act('check')],{'notion-fetch':[J(before),J(before),J(before)],'notion-update-page':[X('Notion timed out.')]});
write('notion',[prepare({operation:'append'}),act('commit')],{'notion-fetch':[J(before)],'notion-update-page':[R({isError:true})]});
write('notion',[prepare(),act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({ok:true})]});
write('notion',[prepare(),act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({results:[{id:'not-a-page'}]})]});
write('notion',[prepare(),act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({async_task:'queued'})]});
write('notion',[prepare(),act('commit'),act('check'),act('check'),act('check')],{'notion-fetch':[J(before),J(before),J(fetched('Packing list','- Tent\n- Stove'))],
 'notion-create-pages':[J({object:'async_task',id:'task_1',status:'queued'})],
 'notion-get-async-task':[J({status:'running'}),J({status:'succeeded',result:{pages:[{url:'https://www.notion.so/'+NEW}]}})]});
write('notion',[prepare(),act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({async_task:{object:'async_task',id:'task_2'}})],'notion-get-async-task':[J({status:'failed'})]});
write('notion',[prepare(),act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({object:'async_task',id:'task_3'})],'notion-get-async-task':[J({status:'succeeded',result:{object:'async_task',id:'again'}})]});
write('notion',[prepare(),act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({object:'async_task',id:'task_4'})],'notion-get-async-task':[J({status:'succeeded',result:'done'})]});
write('notion',[prepare(),act('commit')],{'notion-fetch':[J(before),J(fetched('Trip','# Trip\n\nChanged remotely'))]});
write('notion',[prepare(),act('commit',ID1,1791003600.25),act('commit',ID1,1791003600.5)],{'notion-fetch':[J(before)],'notion-create-pages':[J({pages:[{id:NEW}]})]});
write('notion',[prepare(),act('check'),act('retry'),act('discard'),act('discard')],{'notion-fetch':[J(before)]});
write('notion',[prepare({},1791000000),step({operation:'reviews'})],{'notion-fetch':[J(before)]});
write('notion',[prepare({markdown:'Café ☕ “quoted”   <b>&amp;</b> \\ "x"',title:'Ünïcode 😀'}),act('commit'),act('check')],
 {'notion-fetch':[J(before),J(before),J(fetched('Ünïcode 😀','Café ☕ “quoted”   <b>&amp;</b> \\ "x"'))],'notion-create-pages':[J({pages:[{id:NEW}]})]});
// The commit revalidates against today's schema: a tool that disappeared or changed shape stops the write.
write('notion',[prepare(),act('commit')],{'notion-fetch':[J(before)]},{tools:TOOLS.slice(0,2),uuids:[ID1]});
scenario('notion',[prepare()],{'notion-fetch':[J(before)]},{tools:[{name:'notion-create-pages'}],uuids:[ID1]});
scenario('notion',[prepare()],{'notion-fetch':[J(before)]},{tools:[{name:'notion-create-pages',inputSchema:{}}],uuids:[ID1]});
scenario('notion',[prepare()],{'notion-fetch':[J(before)]},{tools:[{name:'notion-create-pages',inputSchema:[CREATE_SCHEMA]}],uuids:[ID1]});
scenario('notion',[prepare()],{'notion-fetch':[J(before)]},{tools:[{name:'notion-create-pages',inputSchema:{type:'object',required:['parent','pages','icon']}}],uuids:[ID1]});
scenario('notion',[prepare({operation:'append'}),act('commit')],{'notion-fetch':[J(before)],'notion-update-page':[J({pages:[{id:P}]})]},{tools:[{name:'notion-update-page',inputSchema:WRAPPED}],uuids:[ID1]});
scenario('notion',[prepare()],{'notion-fetch':[J(before)]},{tools:{raise:'Server closed the session.'},uuids:[ID1]});
// Draft checks.
write('notion',[prepare({operation:'replace'}),prepare({operation:undefined}),prepare({target:'https://example.com/'+P}),prepare({markdown:''}),prepare({markdown:' \n\t'}),
 prepare({markdown:5}),prepare({markdown:'x'.repeat(30_001)}),prepare({markdown:'é'.repeat(15_000)}),prepare({markdown:'é'.repeat(15_001)}),prepare({title:'t'.repeat(301)}),
 prepare({title:'é'.repeat(300)}),prepare({title:null}),prepare({title:'  '}),prepare({title:'',operation:'append'}),step({operation:'prepare'}),step({operation:'prepare',draft:'text'}),
 {body:{operation:'prepare',draft:draft()}},{body:{operation:'reviews',binding:''}},{body:{operation:'reviews',binding:7}}],
 {'notion-fetch':[J(before)],'notion-update-page':[J({pages:[{id:P}]})]});
write('notion',[prepare()],{'notion-fetch':[J({title:'Tasks',text:`<data-source url="${SOURCE}">`,metadata:{type:'database'}})]});
write('notion',[prepare()],{'notion-fetch':[J(fetched('Big','a',{truncated:true}))]});
write('notion',[prepare()],{'notion-fetch':[J({title:'Index',text:'<page/>'})]});
write('notion',[prepare()],{'notion-fetch':[R({isError:true})]});
// Saved reviews: IDs, bindings, markers, stray and oversized files, the 20-review limit.
const saved=(id:string,extra:any={})=>JSON.stringify({id,operation:'create',target:P,targetTitle:'Trip',title:'Old',markdown:'- Old',binding:BINDING,priorCount:0,url:'https://www.notion.so/'+P,status:'review',createdAt:1791000000.5,tool:'notion-create-pages',args:{},fingerprint:'0',...extra});
write('notion',[step({operation:'reviews'}),act('check',ID2),act('commit',ID2),act('check',ID3),step({operation:'reviews',binding:'notion:sam-workspace'})],{'notion-fetch':[J(before)]},
 {files:{[ID1+'.json']:saved(ID1),[ID2+'.json']:saved(ID2,{status:'review'}),[ID2+'.attempt']:'',[ID3+'.json']:saved(ID3,{binding:'notion:sam-workspace',status:'submitted',url:'https://www.notion.so/'+NEW}),
  'notes.json':'{}','.review-x.tmp':'{}',[ID1.toUpperCase()+'.json']:saved(ID1),'.json':'{}'}});
write('notion',[step({operation:'reviews'})],{},{files:{[ID1+'.json']:saved(ID1,{markdown:'x'.repeat(300_000)})}});
write('notion',[step({operation:'reviews'})],{},{files:{[ID1+'.json']:saved(ID1,{markdown:'x'.repeat(299_000)})}});
for(const id of ['not-a-uuid',ID1.toUpperCase(),'{'+ID1+'}','urn:uuid:'+ID1,ID1.replaceAll('-',''),'-'+'0'.repeat(31),'+'+'1'.repeat(31),'0x'+'1'.repeat(30),'z'.repeat(32),ID2,5,null,'',undefined])
 cases.push({module:'notion',steps:[{body:{binding:BINDING,operation:'check',...(id===undefined?{}:{id})}}],answers:{},files:{[ID1+'.json']:saved(ID1)}});
write('notion',[prepare()],{'notion-fetch':[J(before)]},{files:Object.fromEntries(Array.from({length:20},(_,i)=>[`stray-${i}.json`,'{}']))});
write('notion',[prepare()],{'notion-fetch':[J(before)]},{files:Object.fromEntries(Array.from({length:19},(_,i)=>[`stray-${i}.json`,'{}']))});
write('notion',[act('commit'),act('check')],{'notion-fetch':[J(before)],'notion-create-pages':[J({pages:[{id:NEW}]})]},{files:{[ID1+'.json']:saved(ID1,{status:'pending',task:null,url:'https://www.notion.so/'+NEW})}});
write('notion',[act('check')],{'notion-fetch':[J(fetched('Old','- Old\n- Old'))]},{files:{[ID1+'.json']:saved(ID1,{operation:'append',status:'unconfirmed',priorCount:1})}});
write('notion',[act('check')],{'notion-fetch':[J(fetched('Old','- Old'))]},{files:{[ID1+'.json']:saved(ID1,{operation:'append',status:'unconfirmed'})}});

// Todoist.
const task=(id:string,extra:any={})=>({id,content:'Buy stove fuel',description:'Two canisters',priority:4,dueDate:'2026-10-12',labels:['camping'],checked:false,parentId:null,...extra});
const tasks=(rows:any[],extra:any={})=>({'find-tasks':[J({tasks:rows,...extra})]});
read('todoist',[{},{operation:'list',cursor:'c2'},{operation:'list',cursor:''},{operation:'list',cursor:null}],tasks([task('T1'),task('T2',{priority:1,dueDate:null,description:''}),task('T3',{priority:true,recurring:'every day',duration:{amount:30,unit:'minute'}})],{hasMore:true,nextCursor:'c3'}));
read('todoist',[{operation:'list'}],tasks([task('T1',{priority:0,dueDate:''})],{hasMore:false,nextCursor:'ignored'}));
read('todoist',[{operation:'list'}],tasks([],{hasMore:1,nextCursor:''}));
read('todoist',[{operation:'list'}],tasks([],{hasMore:true,nextCursor:'c'.repeat(4097)}));
read('todoist',[{operation:'list'}],tasks([],{hasMore:'yes',nextCursor:'é'.repeat(4096)}));
read('todoist',[{operation:'list'}],tasks([],{hasMore:true,nextCursor:7}));
read('todoist',[{operation:'list'}],tasks([task('T-1')]));read('todoist',[{operation:'list'}],tasks([task('T1',{content:5})]));
read('todoist',[{operation:'list'}],tasks([task('T1',{description:null})]));read('todoist',[{operation:'list'}],tasks(['T1']));
read('todoist',[{operation:'list'}],tasks([task('T1',{priority:2.5,dueDate:{date:'2026-10-12'}})]));
read('todoist',[{operation:'list'}],{'find-tasks':[J({tasks:{}})]});read('todoist',[{operation:'list'}],{'find-tasks':[J([task('T1')])]});
read('todoist',[{operation:'list'}],{'find-tasks':[R({structuredContent:{tasks:[task('S1')]},content:[T('{"tasks":[]}')]})]});
read('todoist',[{operation:'list'}],{'find-tasks':[R({isError:true})]});read('todoist',[{operation:'list'}],{'find-tasks':[X('Todoist is unreachable.')]});
read('todoist',[{operation:'list',cursor:5},{operation:'list',cursor:'c'.repeat(4097)},{operation:'list',cursor:'é'.repeat(4096)}],tasks([]));
read('todoist',[{operation:'read',id:'T1'},{operation:'read',id:'T2'},{operation:'read'},{operation:'read',id:'T 1'},{operation:'read',id:'x'.repeat(101)},{operation:'read',id:7}],
 {'fetch-object':[J({object:task('T1')}),J({object:task('T9')})]});
read('todoist',[{operation:'read',id:'T1'}],{'fetch-object':[J({object:null})]});read('todoist',[{operation:'read',id:'T1'}],{'fetch-object':[J({})]});
read('todoist',[{operation:'read',id:'T1'}],{'fetch-object':[R({content:[T('[1]')]})]});
read('todoist',[{operation:'review',id:'T1'},{operation:'complete',id:'T1'},{operation:'complete',id:'bad id'},{operation:'undo',id:'T1'},{operation:'delete',id:'T1'}],
 {'fetch-object':[J({object:task('T1'),children:[]}),J({object:task('T1',{checked:true})})],'complete-tasks':[J({completed:['T1']})]});
read('todoist',[{operation:'complete',id:'T1'}],{'complete-tasks':[X('Lost connection.')],'fetch-object':[J({object:task('T1')})]});
read('todoist',[{operation:'complete',id:'T1'}],{'complete-tasks':[J({completed:['T1']})],'fetch-object':[R({isError:true})]});
read('todoist',[{operation:'mystery'},{operation:null}]);

// Linear.
const LIST={name:'list_issues',inputSchema:{type:'object',properties:{assignee:{type:'string'},limit:{type:'number'},orderBy:{type:'string'},includeArchived:{type:'boolean'},cursor:{type:'string'}}}};
const issue=(identifier:string,extra:any={})=>({id:'b5e1c2d3-0000-4000-8000-000000000001',identifier,title:'Fix sign-in redirect',description:'Steps to reproduce',url:'https://linear.app/example/issue/'+identifier,
 status:'In Progress',priority:{name:'High'},project:{name:'Website'},team:{key:'ENG',name:'Engineering'},assignee:{displayName:'Alex'},cycle:{title:'Cycle 12'},
 labels:{nodes:[{name:'bug'},{label:'auth'},'urgent',{name:''},7]},dueDate:'2026-10-20',updatedAt:'2026-10-08T12:00:00Z',createdAt:5,...extra});
const issues=(value:any)=>({list_issues:[J(value)]});
read('linear',[{},{operation:'list',cursor:'cur2'}],issues({issues:[issue('ENG-1'),issue('ENG-2',{status:null,state:{name:'Todo'},priority:2,priorityLabel:'Urgent',labels:['a','b','c','d','e','f','g','h','i'],url:'http://linear.app/x'})],pageInfo:{hasNextPage:true,endCursor:'cur3'}}),{tools:[LIST]});
read('linear',[{operation:'list'}],issues([issue('ENG-3',{identifier:'',id:'uuid-like_id'})]),{tools:[LIST]});
read('linear',[{operation:'list'}],issues({nodes:[issue('ENG-4')],hasMore:true,nextCursor:'n'}),{tools:[{name:'list_issues',inputSchema:{properties:{assigneeId:{},after:{}}}}]});
read('linear',[{operation:'list',cursor:'c'}],issues({results:[]}),{tools:[{name:'list_issues',inputSchema:{properties:{limit:{}}}}]});
read('linear',[{operation:'list',cursor:'c'}],issues({data:[]}),{tools:[{name:'list_issues',inputSchema:{properties:['cursor','limit']}}]});
read('linear',[{operation:'list',cursor:'c'}],issues({data:[]}),{tools:[{name:'list_issues',inputSchema:{properties:'assignee cursor'}}]});
read('linear',[{operation:'list'}],issues({data:[]}),{tools:[{name:'list_issues',inputSchema:{properties:5}}]});
read('linear',[{operation:'list'}],issues({data:[]}),{tools:[{name:'list_issues',inputSchema:'schema'}]});
read('linear',[{operation:'list'}],issues({issues:[],cursor:'x'}),{tools:[{name:'list_issues'}]});
read('linear',[{operation:'list'}],issues({issues:[],pageInfo:{hasNextPage:'true',endCursor:'x'}}),{tools:[{name:'get_issue'}]});
read('linear',[{operation:'list'}],issues({issues:[],pageInfo:{hasNextPage:true}}));
read('linear',[{operation:'list'}],issues({issues:[],pageInfo:{hasNextPage:true,endCursor:'é'.repeat(4097)}}));
read('linear',[{operation:'list'}],issues({issues:[],pageInfo:{endCursor:'',nextCursor:'n1',hasNextPage:null}}));
read('linear',[{operation:'list'}],issues({issues:'none'}));read('linear',[{operation:'list'}],issues({}));
read('linear',[{operation:'list'}],issues(Array.from({length:101},(_,i)=>issue('ENG-'+i))));
read('linear',[{operation:'list'}],issues([issue('ENG 1')]));read('linear',[{operation:'list'}],issues([{title:5,identifier:'ENG-1'}]));
read('linear',[{operation:'list'}],issues([issue('ENG-1',{description:['x']})]));read('linear',[{operation:'list'}],issues(['ENG-1']));
read('linear',[{operation:'list'}],{list_issues:[R({isError:true})]});read('linear',[{operation:'list'}],{list_issues:[R({content:[T('"text"')]})]});
read('linear',[{operation:'list'}],issues([]),{tools:{raise:'Linear is unreachable.'}});
read('linear',[{operation:'list',cursor:7},{operation:'list',cursor:'c'.repeat(4097)}],issues([]));
read('linear',[{operation:'read',id:'ENG-1'},{operation:'read',id:'ENG-1'},{operation:'read',id:'ENG-1'},{operation:'read',id:'eng-1'},{operation:'read',id:'ENG/1'},{operation:'read'}],
 {get_issue:[J({issue:issue('ENG-1')}),J(issue('ENG-1',{description:null})),J({issue:'ENG-1',title:'Flat',identifier:'ENG-1'}),J([issue('eng-1')])]});
read('linear',[{operation:'archive'}]);

// PayPal.
const invoice=(id:string,extra:any={})=>({id,status:'SENT',detail:{invoice_number:'2026-0042',invoice_date:'2026-10-01'},amount:{value:'120.50',currency_code:'USD'},...extra});
const invoices=(value:any)=>({list_invoices:[J(value)]});
read('paypal',[{},{operation:'list',page:2},{operation:'list',page:100}],invoices({items:[invoice('INV2-AB12-CD34'),invoice('INV2-X',{status:null,detail:null,amount:{value:12.5,currency_code:'EURO-LONG'}}),invoice('INV2-Y',{detail:{invoice_number:'n'.repeat(301)},amount:null})]}));
read('paypal',[{operation:'list'}],invoices({data:{invoices:Array.from({length:21},(_,i)=>invoice('INV2-'+i))}}));
read('paypal',[{operation:'list'}],invoices({invoices:[invoice('INV2-1')],items:null}));
read('paypal',[{operation:'list'}],invoices({items:{}}));read('paypal',[{operation:'list'}],invoices({items:[invoice('INV-1')]}));
read('paypal',[{operation:'list'}],invoices({items:['INV2-1']}));read('paypal',[{operation:'list'}],invoices({items:[invoice('INV2-1',{detail:'text'})]}));
read('paypal',[{operation:'list'}],invoices({items:[{id:7}]}));
read('paypal',[{operation:'list'}],{list_invoices:[R({structuredContent:{items:[invoice('INV2-S')]}})]});
read('paypal',[{operation:'list'}],{list_invoices:[R({structuredContent:[1],content:[T('not json'),T('[1]'),T('{"items":[]}')]})]});
read('paypal',[{operation:'list'}],{list_invoices:[R({content:[T('5'),T('{"items":[]}')]})]});
read('paypal',[{operation:'list'}],{list_invoices:[R({content:[T(''),T('{"items":[]}')]})]});
read('paypal',[{operation:'list'}],{list_invoices:[R({isError:true})]});
read('paypal',[{operation:'list',page:0},{operation:'list',page:101},{operation:'list',page:'1'},{operation:'list',page:true},{operation:'list',page:1.5},{operation:'list',page:null}],invoices({items:[]}));
read('paypal',[{operation:'read',id:'INV2-AB12-CD34'}],{get_invoice:[J({invoice:{...invoice('INV2-AB12-CD34'),items:[{name:'Tent rental',quantity:'2',unit_amount:{value:'40.00',currency_code:'USD'}},{quantity:1},{name:'n'.repeat(600),unit_amount:null}]}})]});
read('paypal',[{operation:'read',id:'INV2-1'}],{get_invoice:[J({data:invoice('INV2-1',{items:'ab'})})]});
read('paypal',[{operation:'read',id:'INV2-1'}],{get_invoice:[J(invoice('INV2-1',{items:Array.from({length:120},(_,i)=>({name:'Item '+i}))}))]});
read('paypal',[{operation:'read',id:'INV2-1'}],{get_invoice:[J(invoice('INV2-1',{items:[{name:'x'.repeat(500),quantity:'q'.repeat(40)} as any].concat(Array.from({length:99},()=>({name:'y'.repeat(500)})))}))]});
read('paypal',[{operation:'read',id:'INV2-1'}],{get_invoice:[J({invoice:'INV2-1',id:'INV2-2'})]});
read('paypal',[{operation:'read',id:'INV1-1'},{operation:'read'},{operation:'read',id:['INV2-1']},{operation:'read',id:'INV2-'+'x'.repeat(81)},{operation:'refund'}]);

// Supabase.
const projectRow=(id:string,extra:any={})=>({id,ref:id,name:'Example app',status:'ACTIVE_HEALTHY',region:'us-east-1',organization_id:'org_1',created_at:'2026-01-01T00:00:00Z',anon_key:'not-copied',...extra});
read('supabase',[{operation:'list'}],{list_projects:[J([projectRow('abcd1234'),projectRow('efgh5678',{ref:undefined,status:7,region:''})])]});
read('supabase',[{operation:'list'}],{list_projects:[J({projects:[projectRow('p1',{ref:'p 1'})]})]});
read('supabase',[{operation:'list'}],{list_projects:[J({projects:{}})]});read('supabase',[{operation:'list'}],{list_projects:[J({})]});
read('supabase',[{operation:'list'}],{list_projects:[J(Array.from({length:501},(_,i)=>projectRow('p'+i)))]});
read('supabase',[{operation:'list'}],{list_projects:[J(Array.from({length:500},(_,i)=>projectRow('p'+i)))]});
read('supabase',[{operation:'list'}],{list_projects:[J([{id:'p1'}])]});read('supabase',[{operation:'list'}],{list_projects:[J(['p1'])]});
read('supabase',[{operation:'list'}],{list_projects:[R({isError:true})]});read('supabase',[{operation:'list'}],{list_projects:[R({content:[T('"p1"')]})]});
read('supabase',[{operation:'list',cursor:'next'},{operation:'list',cursor:''},{operation:'list',cursor:0}],{list_projects:[J([])]});
read('supabase',[{operation:'read',id:'abcd1234'},{operation:'read',id:'abcd1234'},{operation:'read',id:'bad id'},{operation:'read'},{},{operation:'pause'}],
 {get_project:[J(projectRow('abcd1234')),J(projectRow('other'))]});

// host.py: MCP_POLICY's endpoint and tool checks when a connection is configured.
const PROBED=['notion-search','notion-fetch','notion-create-pages','list_issues','get_issue','create_issue','find-tasks','fetch-object','complete-tasks','list_projects','get_project','execute_sql','get_me'];
for(const [body,probed] of [[{name:'linear',url:'https://mcp.linear.app/mcp'},PROBED],[{name:'linear',url:'https://mcp.linear.app/mcp'},['create_issue']],[{name:'notion',url:'https://mcp.notion.com/mcp'},PROBED],
 [{name:'todoist',url:'https://ai.todoist.net/mcp'},PROBED],[{name:'todoist',url:'https://ai.todoist.net/mcp'},['find-tasks']],[{name:'todoist',url:'https://example.com/mcp'},PROBED],
 [{name:'supabase',url:'https://mcp.supabase.com/mcp?read_only=true&features=account'},PROBED],[{name:'supabase',url:'https://mcp.supabase.com/mcp'},PROBED],
 [{name:'supabase',url:'https://mcp.supabase.com/mcp?read_only=true&features=account'},['list_projects']],[{name:'paypal',url:'https://mcp.paypal.com/mcp'},['list_invoices','get_invoice','create_invoice']],
 [{name:'paypal',url:'http://mcp.paypal.com/mcp'},PROBED],[{name:'paypal',url:'https://alex:secret@mcp.paypal.com/mcp'},PROBED],[{name:'github',url:'https://api.example.com/mcp'},PROBED],
 [{name:'custom-tool',url:'https://mcp.example.com/'},PROBED],[{name:'Bad Name',url:'https://mcp.example.com/'},PROBED],[{name:'',url:'https://mcp.example.com/'},PROBED],[{name:'x'.repeat(65),url:'https://mcp.example.com/'},PROBED],
 [{name:'linear'},PROBED],[{name:'linear',url:'https://[::1]/mcp'},PROBED]] as [any,string[]][])cases.push({body,probed});
for(const [name,pattern] of [['list_issues','list_*'],['get_me','get_*'],['team_get_issue','*_get_*'],['getter','get_*'],['LIST_x','list_*'],['abc','a?c'],['ac','a?c'],['a.c','a.c'],['abc','a.c'],
 ['a[b','a[b'],['ab','a[!c]'],['ac','a[!c]'],['a-','a[-]'],['b','[a-c]'],['d','[a-c]'],['b','[c-a]'],['!','[!]'],['x','[!]'],['a]','[]]]'],[']','[]]'],['a|b','a|b'],['a\nb','a*b'],['','*'],['x','[!a-c]'],['&','[&&]'],['a^b','a^b'],['ab','a[^c]b'],['a(b','a(b']])
 cases.push({fn:'fnmatch',name,pattern});

// jsonschema: the decisions the Notion write check relies on, with the answers jsonschema gives.
const D7='http://json-schema.org/draft-07/schema#',D4='http://json-schema.org/draft-04/schema#',D2019='https://json-schema.org/draft/2019-09/schema';
for(const [schema,instance,expect] of [[{type:'object'},{},true],[{type:'object'},[],false],[{type:'integer'},1,true],[{type:'integer'},1.5,false],[{type:'integer'},true,false],[{type:'number'},false,false],
 [{type:['string','null']},null,true],[{type:'string',minLength:2},'é',false],[{type:'string',maxLength:1},'😀',true],[{type:'string',pattern:'^a+$'},'aaa',true],[{pattern:'b'},'abc',true],[{pattern:'^b'},'abc',false],
 [{enum:[1,'a']},true,false],[{enum:[1,'a']},1,true],[{const:false},0,false],[{const:{a:[1]}},{a:[1]},true],[{$schema:D4,const:1},2,true],[{required:['a']},{b:1},false],[{required:['a']},[],true],
 [{properties:{a:{type:'string'}},additionalProperties:false},{a:'x',b:1},false],[{properties:{a:{type:'string'}}},{a:1},false],[{patternProperties:{'^x':{type:'number'}},additionalProperties:false},{x1:1,y:2},false],
 [{additionalProperties:{type:'number'}},{a:1,b:2},true],[{items:{type:'number'}},[1,'2'],false],[{$schema:D7,items:[{type:'number'}],additionalItems:false},[1,2],false],[{prefixItems:[{type:'number'}],items:false},[1],true],
 [{prefixItems:[{type:'number'}],items:false},[1,2],false],[{minItems:1},[],false],[{maxItems:1},[1,2],false],[{uniqueItems:true},[1,true],true],[{uniqueItems:true},[{a:1},{a:1}],false],
 [{contains:{type:'string'}},[1,2],false],[{$schema:D2019,contains:{type:'string'},minContains:0},[1],true],[{anyOf:[{type:'string'},{type:'number'}]},null,false],[{oneOf:[{type:'number'},{type:'integer'}]},1,false],
 [{oneOf:[{type:'number'},{type:'integer'}]},1.5,true],[{allOf:[{minimum:1},{maximum:3}]},4,false],[{not:{type:'null'}},null,false],[{if:{type:'number'},then:{minimum:5},else:{type:'string'}},3,false],
 [{if:{type:'number'},then:{minimum:5},else:{type:'string'}},true,false],[{$schema:D4,maximum:3,exclusiveMaximum:true},3,false],[{exclusiveMinimum:3},3,false],[{multipleOf:0.5},2.5,true],[{multipleOf:3},7,false],
 [{minProperties:1},{},false],[{propertyNames:{pattern:'^[a-z]+$'}},{Ab:1},false],[{dependentRequired:{a:['b']}},{a:1},false],[{$schema:D7,dependencies:{a:['b']}},{a:1},false],[{$schema:D7,dependentRequired:{a:['b']}},{a:1},true],
 [{$defs:{n:{type:'number'}},properties:{a:{$ref:'#/$defs/n'}}},{a:'x'},false],[{$schema:D7,definitions:{n:{type:'number'}},properties:{a:{$ref:'#/definitions/n',type:'string'}}},{a:1},true],
 [{$defs:{n:{type:'number'}},properties:{a:{$ref:'#/$defs/n',type:'string'}}},{a:1},false],[{properties:{a:{$ref:'#'}},type:'object'},{a:{a:{}}},true],[{properties:{a:{$ref:'#'}},type:'object'},{a:{a:1}},false],
 [true,5,true],[false,5,false],[{format:'email'},'not an email',true],[{type:'object',properties:{data:{anyOf:[{type:'object'},{type:'null'}]}},required:['data']},{data:null},true],[CREATE_SCHEMA,{parent:{page_id:P},pages:[{properties:{title:'x'},content:'y'}],allow_async:false},true],
 [CREATE_SCHEMA,{parent:{page_id:P,extra:1},pages:[{properties:{}}]},false],[CREATE_SCHEMA,{parent:{page_id:P},pages:[]},false],[UPDATE_SCHEMA,{page_id:P,command:'delete'},false]] as [any,any,boolean][])
 cases.push({fn:'schema',schema,instance,expect});

// Both sides.
const expected=python(cases),actual:any[]=[];
for(const c of cases)actual.push(await port(JSON.parse(JSON.stringify(c))));
const failures:string[]=[];
cases.forEach((c,i)=>{
 const label=JSON.stringify(c).slice(0,240);
 let want=expected.cases[i];
 if(c.fn==='schema'){
  assert.equal(actual[i].value,c.expect,'the port decides as jsonschema does: '+label);
  if(want.unavailable)return;
  assert.equal(want.value,c.expect,'the recorded jsonschema answer: '+label);
 }
 try{assert.deepEqual(actual[i],want,label);}catch(error){failures.push(error.message);}
 want=null;
});
if(failures.length){for(const f of failures.slice(0,Number(process.env.SHOW??3)))console.error(f.slice(0,4000));throw new Error(failures.length+' fixtures differ');}
const policy=Object.fromEntries(Object.entries(MCP_POLICY).map(([name,rule])=>[name,{tools:[...rule.tools],...(rule.endpoint?{endpoint:[rule.endpoint.url,rule.endpoint.message]}:{}),...(rule.required?{required:rule.required}:{})}]));
assert.deepEqual({READ_SHAPED:[...READ_SHAPED],MCP_POLICY:policy},expected.policy,'host.py READ_SHAPED and MCP_POLICY');

// Guard against a vacuous pass: per module, answers, refusals and tool calls were exercised.
const counts:Record<string,number>={};
for(const [i,c] of cases.entries()){
 const key=c.module??(c.probed?'configure':c.fn);
 counts[key]=(counts[key]??0)+1;
 if(c.module){assert.ok(expected.cases[i].gates.length===c.steps.length,'every step asked for its gate');}
}
const stepsOf=(module:string)=>expected.cases.filter((_:any,i:number)=>cases[i].module===module).flatMap((e:any)=>e.steps);
for(const module of ['notion','todoist','linear','paypal','supabase']){
 const steps=stepsOf(module),ok=steps.filter((s:any)=>'value' in s).length;
 assert.ok(ok>=5&&steps.length-ok>=5,`${module}: answers ${ok}, refusals ${steps.length-ok}`);
}
const statuses=new Set(stepsOf('notion').map((s:any)=>s.value?.status).filter(Boolean));
for(const status of ['review','submitted','unconfirmed','pending','failed','verified'])assert.ok(statuses.has(status),'a Notion review reaches '+status);
assert.ok(expected.cases.some((e:any)=>Object.keys(e.files??{}).some((f:string)=>f.endsWith('.attempt'))),'a write leaves its attempted marker');
const summary=Object.entries(counts).map(([k,n])=>`${k} ${n}`).join(', ');
console.log(`PASS MCP connectors parity: ${cases.length} fixtures (${summary}) answer the same in core/accounts/mcp as Hermes notion_mcp, notion_writes, todoist_mcp, linear_mcp, paypal_mcp, supabase_mcp, mcp_payload and host.py MCP_POLICY (results, errors, tool calls, gates, review files; ${expected.schema??'jsonschema absent: recorded schema answers'}).`);
