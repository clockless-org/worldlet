// Resident Harness sessions (the `conversation` and `approvals` services of contracts/harness-services.ts) for the
// person's own Agents: one Harness session per Fox thread, which keeps the context and compacts it, instead of one
// process per turn carrying the last six messages. Shared rules only: which thread a turn belongs to, the Agent Client
// Protocol permission mapping (Hermes Agent), the OpenClaw Gateway's `/v1/responses` request and stream, and its
// WebSocket exec approvals. Running the process, the HTTP calls, the socket and the device key is the host's job. Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessApprovalChoice,HarnessApprovalRequest,HarnessApprovalResult,HarnessSessionKey,HarnessUsage} from '../../contracts/harness-services.ts';
import type {LocalHarnessId} from './local-harness.ts';
import {responsesUsage} from './harness-usage.ts';
import {hermesStreamAnnouncement,type HermesAnnouncedCall} from './hermes-server.ts';

/** Harnesses with a resident interface: Hermes Agent's `hermes acp` (one process, a session per thread) and OpenClaw's
 * Gateway (`/v1/responses`, a session key per thread). Others keep one process per turn. */
export const LOCAL_HARNESS_RESIDENT:readonly LocalHarnessId[]=['hermes','openclaw'];

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const clip=(text:string,limit:number)=>text.length>limit?text.slice(0,limit):text;

/** The Fox thread a turn is said in, from the chat's place thread (ui/attention contextThread `["<place>","<view>"]`):
 * an item card's own thread, an Applet's own thread, else the main conversation. Same prefixes as core/phone phoneLive. */
export function harnessSessionThread(thread:unknown):string {
 let place='';
 try{const value=JSON.parse(String(thread??''));if(Array.isArray(value)&&typeof value[0]==='string')place=value[0];}catch{}
 if(place.startsWith('attention:')&&place.length>10)return 'item:'+clip(place.slice(10),200);
 if(place.startsWith('object:app-')&&place.length>11)return 'applet:'+clip(place.slice(11),120);
 return 'main';
}
/** The chat's thread for a resident session's thread (the other way): an item card's or an Applet's place, else Fox's
 * main conversation (`fox-main`, contracts/companion-conversation.ts). The view part is not kept, so it is the place's
 * own thread. */
export function harnessChatThread(thread:string):string {
 if(thread.startsWith('item:')&&thread.length>5)return JSON.stringify(['attention:'+thread.slice(5),'']);
 if(thread.startsWith('applet:')&&thread.length>7)return JSON.stringify(['object:app-'+thread.slice(7),'']);
 return 'fox-main';
}
/** The place thread a session thread came from, so a turn another Worldlet sends (core/phone remote-agent.ts) opens the
 * same thread's session on this computer: `harnessSessionThread(harnessThreadPlace(t))===t` for each thread above. */
export function harnessThreadPlace(thread:string):string {
 if(thread.startsWith('item:')&&thread.length>5)return JSON.stringify(['attention:'+clip(thread.slice(5),200),'']);
 if(thread.startsWith('applet:')&&thread.length>7)return JSON.stringify(['object:app-'+clip(thread.slice(7),120),'']);
 return JSON.stringify(['','']);
}
/** The turn's input as the session receives it: the World's note since its last reply (HarnessTurnInput.world), then
 * the line. Every resident adapter sends this, so no Harness reads the note its own way. */
export const harnessTurnText=(input:{text:string;world?:string}):string=>(typeof input.world==='string'&&input.world.trim()?input.world.trim()+'\n\n':'')+input.text;
/** A stable printable name for a session key (FNV-1a over world and thread, so any thread text fits a header). */
export function harnessSessionName(key:HarnessSessionKey):string {
 const text=key.world+'\u0000'+key.thread+'\u0000'+(key.agent??'');
 let hash=0x811c9dc5;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}
 const label=(key.world+'-'+key.thread).replace(/[^A-Za-z0-9._-]+/g,'-').slice(0,80);
 return 'worldlet-'+label+'-'+hash.toString(16).padStart(8,'0');
}

// Approvals over the Agent Client Protocol (Hermes Agent) ---------------------------------------------------------

const ACP_CHOICE:Record<string,HarnessApprovalChoice>={allow_once:'once',allow_always:'always',reject_once:'deny',reject_always:'deny'};
/** ACP has no session-scoped kind, so Hermes Agent offers "Allow for session" as `allow_always` with its own id
 * (acp_adapter/permissions.py `allow_session`): an option whose id or name says session is not Always. */
const sessionOnly=(option:Record<string,any>)=>/session/i.test(String(option.optionId??''))||/session/i.test(String(option.name??''));
const always=(options:Record<string,any>[])=>options.find(option=>option.kind==='allow_always'&&typeof option.optionId==='string'&&!sessionOnly(option));
/** A `session/request_permission` as the World's approval card: the tool call's title, its command or input (or the
 * files an edit would change), the choices its options offer (Always only when one keeps it beyond this session;
 * Deny is always there: an unanswered or cancelled request is declined) and `rule`, what Always would allow (Hermes
 * Agent's `rawInput.description` is the pattern key it saves, tools/approval.py). */
export function acpApprovalRequest(id:string,params:unknown,{title='Your Agent',now=Date.now(),timeoutMs=10*60_000}:{title?:string;now?:number;timeoutMs?:number}={}):HarnessApprovalRequest {
 const input=record(params),call=record(input.toolCall),raw=record(call.rawInput);
 const options=Array.isArray(input.options)?input.options.map(record):[];
 const choices:HarnessApprovalChoice[]=[];
 for(const choice of ['once','always','deny'] as const)if(choice==='deny'||(choice==='always'?!!always(options):options.some(option=>ACP_CHOICE[String(option.kind)]===choice)))choices.push(choice);
 const blocks=Array.isArray(call.content)?call.content.map(record):[];
 const content=blocks.map(item=>item.type==='diff'&&typeof item.path==='string'?(typeof item.oldText==='string'?'Edit ':'Create ')+item.path:record(item.content).text??item.text).filter((text:unknown)=>typeof text==='string').join('\n');
 const detail=typeof raw.command==='string'?raw.command:typeof call.rawInput==='string'?call.rawInput:content||(Object.keys(raw).length?JSON.stringify(raw):'');
 const rule=typeof raw.description==='string'&&raw.description.trim()?raw.description.trim():typeof raw.command==='string'&&raw.command.trim()?raw.command.trim():'';
 return {id,title:clip(typeof call.title==='string'&&call.title.trim()?`${title} asks: ${call.title.trim()}`:`${title} asks for permission`,200),detail:clip(detail,2000),choices,expiresAt:now+timeoutMs,...rule&&choices.includes('always')?{rule:clip(rule,300)}:{}};
}
/** The ACP answer for a choice: the matching option (for Always one that outlasts the session), else a reject option,
 * else `cancelled`. */
export function acpApprovalOutcome(params:unknown,choice:HarnessApprovalChoice):{outcome:{outcome:'selected';optionId:string}|{outcome:'cancelled'}} {
 const options=Array.isArray(record(params).options)?record(params).options.map(record):[];
 if(choice==='always'){const option=always(options);if(option)return {outcome:{outcome:'selected',optionId:option.optionId}};}
 const kinds=choice==='deny'?['reject_once','reject_always']:['allow_once'];
 for(const kind of kinds){const option=options.find(item=>item.kind===kind&&typeof item.optionId==='string');if(option)return {outcome:{outcome:'selected',optionId:option.optionId}};}
 return {outcome:{outcome:'cancelled'}};
}
export const isHarnessApprovalChoice=(value:unknown):value is HarnessApprovalChoice=>value==='once'||value==='always'||value==='deny';
/** A request as it crosses into the page and the phone: bounded strings and known choices only. */
export function readHarnessApprovalRequest(value:unknown):HarnessApprovalRequest|null {
 const v=record(value);
 if(typeof v.id!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/.test(v.id)||typeof v.title!=='string'||!v.title.trim())return null;
 const choices=(Array.isArray(v.choices)?v.choices:[]).filter(isHarnessApprovalChoice);
 if(!choices.includes('deny'))choices.push('deny');
 const extra:Record<string,string>={};
 for(const [key,limit] of [['rule',300],['agent',64],['thread',240]] as const)if(typeof v[key]==='string'&&v[key].trim())extra[key]=clip(v[key],limit);
 return {id:v.id,title:clip(v.title,200),detail:typeof v.detail==='string'?clip(v.detail,2000):'',choices:[...new Set(choices)] as HarnessApprovalChoice[],...Number.isFinite(v.expiresAt)?{expiresAt:Number(v.expiresAt)}:{},...extra};
}
/** What an approved action changed, as it crosses into the page: a request id, at most 20 files with bounded diffs. */
export function readHarnessApprovalResult(value:unknown):HarnessApprovalResult|null {
 const v=record(value);
 if(typeof v.id!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/.test(v.id)||(v.status!=='completed'&&v.status!=='failed'))return null;
 const files=(Array.isArray(v.files)?v.files:[]).map(record).filter(f=>typeof f.path==='string'&&f.path&&typeof f.diff==='string').slice(0,20)
  .map(f=>({path:clip(f.path,400),change:f.change==='add'||f.change==='delete'?f.change:'edit' as const,diff:clip(f.diff,40_000)}));
 return {id:v.id,status:v.status,files,reported:v.reported!==false,...typeof v.output==='string'&&v.output?{output:clip(v.output,4000)}:{}};
}

// OpenClaw Gateway `/v1/responses` ----------------------------------------------------------------------------------

/** Port and secret of the person's OpenClaw Gateway (docs.openclaw.ai/gateway/config-gateway): `OPENCLAW_GATEWAY_PORT`,
 * else `gateway.port`, else 18789; `gateway.auth.token` or `password` (a `${VAR}` reference reads that variable), else
 * `OPENCLAW_GATEWAY_TOKEN`/`OPENCLAW_GATEWAY_PASSWORD`. Read only; Worldlet never writes their configuration. */
export function openClawGateway(config:unknown,env:Record<string,string|undefined>):{port:number;secret:string|null;responses:boolean|null} {
 const gateway=record(record(config).gateway),auth=record(gateway.auth);
 const port=Number(env.OPENCLAW_GATEWAY_PORT)||Number(gateway.port)||18789;
 const value=(text:unknown)=>{if(typeof text!=='string'||!text.trim())return null;const ref=/^\$\{([A-Z0-9_]+)\}$/.exec(text.trim());return ref?env[ref[1]]||null:text.trim();};
 const secret=auth.mode==='password'?value(auth.password)??env.OPENCLAW_GATEWAY_PASSWORD??null:value(auth.token)??value(auth.password)??env.OPENCLAW_GATEWAY_TOKEN??env.OPENCLAW_GATEWAY_PASSWORD??null;
 const enabled=record(record(record(gateway.http).endpoints).responses).enabled;
 return {port:Number.isInteger(port)&&port>0&&port<65536?port:18789,secret:secret||null,responses:typeof enabled==='boolean'?enabled:null};
}
export type ResponsesTool={name:string;description:string;parameters:Record<string,unknown>};
/** One `/v1/responses` request: World tools as client function tools; the session is the request's
 * `x-openclaw-session-key` header, and a tool round continues its response (`previous_response_id`). `agent`: one of
 * the person's other OpenClaw agents (`openclaw/<id>`), else their default one. */
export function openClawResponsesBody({agent,...turn}:ResponsesTurn&{agent?:string|null}):Record<string,unknown> {
 return responsesBody({...turn,model:agent?'openclaw/'+agent:'openclaw'});
}
export type ResponsesTurn={input:unknown[];instructions:string;tools:ResponsesTool[]|null;previous?:string|null};
/** A streamed `/v1/responses` request; without `model` the server answers with its own (Hermes Agent's API server). */
export function responsesBody({model,input,instructions,tools,previous}:ResponsesTurn&{model?:string|null}):Record<string,unknown> {
 return {...model?{model}:{},stream:true,input,...instructions?{instructions}:{},...tools?.length?{tools:tools.map(tool=>({type:'function',name:tool.name,description:tool.description,parameters:tool.parameters})),tool_choice:'auto'}:{},...previous?{previous_response_id:previous}:{}};
}
export const openClawUserInput=(text:string)=>[{type:'message',role:'user',content:text}];

/** Running state of one `/v1/responses` stream; `usage` is the response's own, when its final event carries one.
 * `announced`: calls to Worldlet's standing server the Agent announced before running them (Hermes, HermesOwnCalls). */
export interface ResponsesStream {buffered:string;text:string;id:string|null;calls:{call_id:string;name:string;arguments:string}[];announced:HermesAnnouncedCall[];error:string|null;done:boolean;final:string|null;usage:HarnessUsage|null}
export const responsesStream=():ResponsesStream=>({buffered:'',text:'',id:null,calls:[],announced:[],error:null,done:false,final:null,usage:null});
/** Reads a chunk of the server-sent event stream; returns the answer text to show now. */
export function readResponsesChunk(state:ResponsesStream,chunk:string):string {
 state.buffered+=chunk.replace(/\r\n/g,'\n');
 let shown='',end:number;
 while((end=state.buffered.indexOf('\n\n'))>=0){
  const frame=state.buffered.slice(0,end);state.buffered=state.buffered.slice(end+2);
  let type='',data='';
  for(const line of frame.split('\n')){if(line.startsWith('event:'))type=line.slice(6).trim();else if(line.startsWith('data:'))data+=(data?'\n':'')+line.slice(5).replace(/^ /,'');}
  if(data==='[DONE]'){state.done=true;continue;}
  let event:Record<string,any>;
  try{event=record(JSON.parse(data));}catch{continue;}
  type=type||String(event.type??'');
  const response=record(event.response);
  if(typeof response.id==='string'&&response.id)state.id=response.id;
  if(response.usage)state.usage=responsesUsage(response.usage)??state.usage;
  if(type==='response.output_text.delta'&&typeof event.delta==='string'){state.text+=event.delta;shown+=event.delta;}
  else if(type==='response.output_item.added'){const call=hermesStreamAnnouncement(event.item);if(call)state.announced.push(call);}
  else if(type==='response.output_item.done'){
   const item=record(event.item);
   if(item.type==='function_call'&&typeof item.call_id==='string'&&typeof item.name==='string')state.calls.push({call_id:item.call_id,name:item.name,arguments:typeof item.arguments==='string'?item.arguments:JSON.stringify(item.arguments??{})});
  }else if(type==='response.completed'){
   const output=Array.isArray(response.output)?response.output.map(record):[];
   const text=output.filter(item=>item.type==='message').flatMap(item=>Array.isArray(item.content)?item.content.map(record):[]).filter(part=>part.type==='output_text'&&typeof part.text==='string').map(part=>part.text).join('');
   if(text)state.final=text;
   state.done=true;
  }else if(type==='response.failed'||type==='response.incomplete'||type==='error'){
   const error=record(response.error??event.error);
   state.error=typeof error.message==='string'&&error.message?error.message:type==='response.incomplete'?'OpenClaw stopped before it finished.':'OpenClaw could not answer.';
   state.done=true;
  }
 }
 return shown;
}

// OpenClaw Gateway WebSocket exec approvals -----------------------------------------------------------------------
// Its exec approvals travel only on the Gateway's WebSocket (docs.openclaw.ai/gateway/protocol, protocol 4): frames
// `{type:"req",id,method,params}`, `{type:"res",id,ok,payload|error}`, `{type:"event",event,payload}`; the Gateway
// sends `connect.challenge` `{nonce,ts}` first, the client answers `connect` with the shared secret and an Ed25519
// device identity that signs the challenge (a device-less operator gets no scopes; a loopback device is paired
// silently by default). `exec.approval.requested` `{id,request:{command,sessionKey,allowedDecisions,...},expiresAtMs}`
// is answered with `exec.approval.resolve` `{id,decision}` (scope `operator.approvals`); `exec.approval.resolved`
// settles it everywhere.

export const OPENCLAW_PROTOCOL=4;
/** What Worldlet asks for: reading and answering approvals, nothing that writes the person's Gateway. */
export const OPENCLAW_APPROVAL_SCOPES=['operator.approvals','operator.read'];
const OPENCLAW_CLIENT={id:'cli',mode:'cli'};
/** The text the device key signs (`v3`, packages/gateway-client device-auth): device, client, role, scopes, the
 * challenge's time and nonce, the shared secret, platform and family (lower case). */
export function openClawDeviceProof({device,nonce,signedAt,secret,platform}:{device:string;nonce:string;signedAt:number;secret:string|null;platform:string}):string {
 return ['v3',device,OPENCLAW_CLIENT.id,OPENCLAW_CLIENT.mode,'operator',OPENCLAW_APPROVAL_SCOPES.join(','),String(signedAt),secret??'',nonce,platform.trim().toLowerCase(),''].join('|');
}
/** The `connect` request: an operator client that takes approvals, the secret in both shared-secret fields (the
 * Gateway reads the one its auth mode names), and the signed device. */
export function openClawConnect({id,nonce,signedAt,secret,platform,version,device}:{id:string;nonce:string;signedAt:number;secret:string|null;platform:string;version:string;device:{id:string;publicKey:string;signature:string}}):Record<string,unknown> {
 return {type:'req',id,method:'connect',params:{minProtocol:OPENCLAW_PROTOCOL,maxProtocol:OPENCLAW_PROTOCOL,
  client:{id:OPENCLAW_CLIENT.id,displayName:'Worldlet',version:version||'1',platform,mode:OPENCLAW_CLIENT.mode},
  role:'operator',scopes:OPENCLAW_APPROVAL_SCOPES,caps:['approvals'],...secret?{auth:{token:secret,password:secret}}:{},
  device:{id:device.id,publicKey:device.publicKey,signature:device.signature,signedAt,nonce}}};
}
/** One Gateway frame, or null for anything else. */
export function readOpenClawFrame(text:unknown):{type:'event';event:string;payload:Record<string,any>}|{type:'res';id:string;ok:boolean;payload:Record<string,any>;error:string}|null {
 let frame:Record<string,any>;
 try{frame=record(JSON.parse(String(text)));}catch{return null;}
 if(frame.type==='event'&&typeof frame.event==='string')return {type:'event',event:frame.event,payload:record(frame.payload)};
 if(frame.type==='res'&&typeof frame.id==='string'){const error=record(frame.error);return {type:'res',id:frame.id,ok:frame.ok===true,payload:record(frame.payload),error:typeof error.message==='string'&&error.message?clip(error.message,300):''};}
 return null;
}
/** Whether an OpenClaw session key is Fox's session `name`: the Gateway keeps an explicit `x-openclaw-session-key` as
 * given or under its agent (`agent:<agentId>:<key>`, OpenClaw toAgentStoreSessionKey), compared without case. Used by
 * the approvals match and the history sync's own-session check alike. */
export function openClawSessionIs(key:unknown,name:string):boolean {
 if(typeof key!=='string'||typeof name!=='string')return false;
 const value=key.trim().toLowerCase(),own=name.trim().toLowerCase();
 if(!value||!own)return false;
 if(value===own)return true;
 const parts=/^agent:([^:]+):(.+)$/.exec(value);
 return parts!==null&&parts[2]===own;
}
/** Whether an approval belongs to the Gateway session Fox's turn runs on. */
export function openClawApprovalFor(payload:unknown,session:string):boolean {
 return openClawSessionIs(record(record(payload).request).sessionKey,session);
}
const CLAW_CHOICE:Record<string,HarnessApprovalChoice>={'allow-once':'once','allow-always':'always',deny:'deny'};
const CLAW_DECISION:Record<HarnessApprovalChoice,string>={once:'allow-once',always:'allow-always',deny:'deny'};
/** An `exec.approval.requested` as the World's approval card: the command (its warning first), the decisions it
 * allows (all three when it does not say; Deny always), when the Gateway lets it expire, and `rule`, the command an
 * allow-always binds (with its arguments, in its folder). */
export function openClawApprovalRequest(payload:unknown,{title='OpenClaw'}:{title?:string}={}):HarnessApprovalRequest|null {
 const p=record(payload),request=record(p.request);
 if(typeof p.id!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/.test(p.id))return null;
 const command=typeof request.command==='string'&&request.command.trim()?request.command:typeof request.commandPreview==='string'?request.commandPreview:'';
 const warning=typeof request.warningText==='string'&&request.warningText.trim()?request.warningText.trim()+'\n':'';
 const allowed=Array.isArray(request.allowedDecisions)?request.allowedDecisions.map((d:unknown)=>CLAW_CHOICE[String(d)]).filter(Boolean):['once','always'];
 const choices=(['once','always','deny'] as const).filter(choice=>choice==='deny'||allowed.includes(choice));
 return {id:p.id,title:clip(`${title} asks to run a command`,200),detail:clip(warning+command,2000),choices,...Number.isFinite(p.expiresAtMs)?{expiresAt:Number(p.expiresAtMs)}:{},...command.trim()&&choices.includes('always')?{rule:clip(command.trim(),300)}:{}};
}
export const openClawDecision=(choice:HarnessApprovalChoice)=>CLAW_DECISION[choice];
