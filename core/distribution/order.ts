// Order (owner request 2026-10-05): the team's own button, a round bug just left of Fox's message bar since 2026-10-06,
// only in the Alpha and Dev apps. One click
// enters Fox's voice mode; what the person then says goes, with pictures of the window and the recent operation log,
// to the owner's Claude project as a task. It is the one exception to "no screen or voice recording": it captures only
// after that click, while Fox shows it is listening, and only on these two channels. Feedback is the users' button.
// The host sends the item to the admin service's requirement inbox (source `order`, gatehouse/inbox.mjs)
// with the machine credential of the computer it runs on; the project's coordinator claims those items on their own.
import type {UpdateChannel} from './update-channel.ts';

export const ORDER={name:'Order',hint:'Order: click, say the bug or task, click again. It goes to the team’s Claude with a picture of this window, your recent steps and this computer’s logs (Alpha and Dev only).'} as const;
/** The same corner button wherever Order is not available: it opens Fox's Feedback page (owner 2026-10-07). */
export const ORDER_FEEDBACK={name:'Feedback',hint:'Feedback: tell the Worldlet team about a bug or what could be better.'} as const;
/** Only the team's channels; Beta and Production never show or send it. */
export const orderAvailable=(channel:UpdateChannel)=>channel==='alpha'||channel==='dev';

/** How far back the operation log reaches, and its bounds (the inbox takes 20,000 characters of text). */
export const ORDER_LOG={minutes:15,lines:150,lineChars:320} as const;
/** The local diagnostics an Order carries (owner 2026-10-06: "收集对我们产品 Debug 有用的就行"): Core-classified errors of
 * the last hour (logs/diagnostics.jsonl), the last Fox replies' timings (logs/fox-timing.jsonl) and the newest lines of
 * the agent harness's own error log. */
export const ORDER_DIAGNOSTICS={errorHours:1,errors:20,timings:5,agentLines:12,agentLineChars:300} as const;
/** The whole local logs beside that summary (owner 2026-10-06: 「为什么不收集更多的信息」…「做」), as text files the admin
 * inbox keeps in R2 next to the screenshots (gatehouse/inbox.mjs MAX_FILES, MAX_FILE_BYTES): each log's newest
 * `fileBytes`, at most `files` of them. */
export const ORDER_FILES={files:12,fileBytes:600_000} as const;
const FILE_NAME=/^[a-z0-9][a-z0-9._-]{0,62}\.(?:log|jsonl|json|txt)$/;
const utf8=(text:string)=>new TextEncoder().encode(text).length;
/** The files an Order sends: valid names only, each one's newest ORDER_FILES.fileBytes, credentials blanked, empty
 * ones and repeats dropped. */
export function orderFiles(files:readonly {name:string;text:string}[]):{name:string;text:string}[] {
 const seen=new Set<string>(),out:{name:string;text:string}[]=[];
 for(const f of files){
  if(out.length>=ORDER_FILES.files||!FILE_NAME.test(f.name)||seen.has(f.name)||!f.text.trim())continue;
  let text=orderRedact(f.text);
  if(utf8(text)>ORDER_FILES.fileBytes){text=text.slice(-ORDER_FILES.fileBytes);while(utf8(text)>ORDER_FILES.fileBytes)text=text.slice(Math.ceil(text.length/20));
   const cut=text.indexOf('\n');if(cut>=0&&cut<text.length-1)text=text.slice(cut+1);}
  seen.add(f.name);out.push({name:f.name,text});
 }
 return out;
}
export const ORDER_FRAMES=4,ORDER_FRAME_BYTES=300*1024;
/** Lays one 4-byte-per-pixel picture over another at (x, y), clipped to the base; the base changes in place.
 * The World view shows only a white frame where a website panel is (the page is a view of its own), so the
 * Order's first picture gets the page's own picture there and shows what the person saw (owner Order 2026-10-07). */
export function orderOverlay(base:{width:number;height:number;pixels:Uint8Array},top:{width:number;height:number;pixels:Uint8Array},x:number,y:number):boolean {
 if(base.pixels.length!==base.width*base.height*4||top.pixels.length!==top.width*top.height*4)return false;
 const x0=Math.max(0,x),x1=Math.min(base.width,x+top.width),y0=Math.max(0,y),y1=Math.min(base.height,y+top.height);
 if(x1<=x0||y1<=y0)return false;
 for(let row=y0;row<y1;row++){
  const from=((row-y)*top.width+(x0-x))*4;
  base.pixels.set(top.pixels.subarray(from,from+(x1-x0)*4),(row*base.width+x0)*4);
 }
 return true;
}
const SAID_CHARS=4000,BODY_CHARS=19_000;

// The admin service refuses any item that looks like it carries a credential (action-apply.mjs SECRET); those parts
// of a log line are blanked instead, so one stray value never loses the task.
const SECRETS=/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abposr]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|\bBearer\s+[A-Za-z0-9._~+/-]{20,}|\b(?:password|passwd|secret|token|api[_-]?key|credential)s?\s*[:=]\s*\S{6,}/gi;
export const orderRedact=(text:string)=>text.replace(SECRETS,'[redacted]');

type LedgerRow={seq?:unknown;at?:unknown;kind?:unknown;key?:unknown;body?:unknown};
type Fields=Record<string,unknown>;
const clock=(seconds:number)=>new Date(seconds*1000).toISOString().slice(11,19);
const object=(v:unknown):v is Fields=>!!v&&typeof v==='object'&&!Array.isArray(v);
// A history row's body wraps what happened in its identity envelope (world-history.ts, core/activity): ids, times and
// the kind again. Those said nothing and filled the line, so the label and URL after them were cut off.
const ENVELOPE=new Set(['version','id','at','kind','observedAt','surfaceId','visitId']);
function fields(body:unknown):unknown {
 if(!object(body))return body;
 const out:Fields={};
 for(const [k,v] of Object.entries(body))if(!ENVELOPE.has(k)&&k!=='data')out[k]=v;
 if(object(body.data))Object.assign(out,body.data);else if(body.data!==undefined)out.data=body.data;
 return out;
}
/** The world ledger's rows of the last ORDER_LOG.minutes, oldest first, one bounded line each:
 * `08:19:02 activity.ui.click app-gmail {"label":"Archive"}`. `now` is in seconds, like the rows. */
export function orderLog(rows:readonly LedgerRow[],now:number):string[] {
 const since=now-ORDER_LOG.minutes*60;
 return rows.filter(r=>typeof r.at==='number'&&r.at>=since&&r.at<=now+60&&typeof r.kind==='string')
  .sort((a,b)=>Number(a.seq)-Number(b.seq)).slice(-ORDER_LOG.lines)
  .map(r=>{
   let body='';try{const f=fields(r.body);body=f===undefined||object(f)&&!Object.keys(f).length?'':JSON.stringify(f);}catch{}
   const line=[clock(r.at as number),r.kind,typeof r.key==='string'&&r.key?r.key:'',body].filter(Boolean).join(' ').replace(/\s+/g,' ');
   return orderRedact(line.length>ORDER_LOG.lineChars?line.slice(0,ORDER_LOG.lineChars-1)+'…':line);
  });
}

const seconds=(at:unknown)=>typeof at==='string'?Date.parse(at)/1000:NaN;
const ms=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?(v<1000?Math.round(v)+' ms':(v/1000).toFixed(1)+' s'):'';
/** Core-projected error rows (core/diagnostics/report.ts diagnosticError) of the last ORDER_DIAGNOSTICS.errorHours,
 * oldest first: `06:41:02 agent agentChat timeout request 1a2b3c4d`. `now` is in seconds. */
export function orderErrors(rows:readonly Fields[],now:number):string[] {
 const since=now-ORDER_DIAGNOSTICS.errorHours*3600;
 return rows.filter(r=>seconds(r.at)>=since&&seconds(r.at)<=now+60).slice(-ORDER_DIAGNOSTICS.errors).map(r=>[clock(seconds(r.at)),r.area,r.operation,r.code,
  typeof r.requestId==='string'?'request '+r.requestId.slice(0,8):'',r.nativeCode!==undefined?`native ${r.nativeDomain??''} ${r.nativeCode}`:''].filter(v=>typeof v==='string'&&v.trim()).join(' ').replace(/\s+/g,' '));
}
const STAGES:[string,string][]=[['totalMs','total'],['firstTextMs','first text'],['firstDeltaMs','first delta'],['modelMs','model'],['toolsMs','tools'],['queueMs','queue'],['launchMs','launch']];
/** The last ORDER_DIAGNOSTICS.timings Fox requests (core/diagnostics/fox-timing.ts rows, newest row per request wins),
 * oldest first: `06:40:11 conversation complete · total 8.2 s · first text 2.1 s · model 6.0 s`. */
export function orderTimings(rows:readonly Fields[]):string[] {
 const last=new Map<string,Fields>();
 for(const r of rows)if(typeof r.id==='string'){last.delete(r.id);last.set(r.id,r);}
 return [...last.values()].slice(-ORDER_DIAGNOSTICS.timings).map(r=>{
  const at=seconds(r.at),head=[Number.isFinite(at)?clock(at):'',r.kind??'reply',r.outcome??'running',r.lastStage&&r.outcome!=='complete'?`at ${r.lastStage}`:''].filter(Boolean).join(' ');
  return [head,...STAGES.flatMap(([k,label])=>ms(r[k])?[label+' '+ms(r[k])]:[])].join(' · ');
 });
}

export type OrderDiagnostics={
 /** The operating system and its version, e.g. `macos 15.4.1`. */
 system:string;
 /** The installation id PostHog events carry (installation_id), so this computer's events can be found there. */
 installation?:string;
 errors:readonly string[];timings:readonly string[];
 /** The newest lines of the agent harness's error log, as written (credentials are blanked with the rest of the item). */
 agent:readonly string[]};
export type OrderFacts={said:string;at:Date;id:string;channel:UpdateChannel;version:string;build:number;platform:string;
 /** What the window showed: the place or Applet and the open site, when known. */
 place?:string;log:readonly string[];diagnostics?:OrderDiagnostics;
 /** Each picture: what it shows (the World, a website page) and its JPEG in base64. */
 frames:readonly {label:string;jpeg:string}[];
 /** Whole local logs, sent as files (orderFiles bounds them). */
 files?:readonly {name:string;text:string}[]};
function diagnosticSections(d:OrderDiagnostics):string[] {
 const agent=d.agent.slice(-ORDER_DIAGNOSTICS.agentLines).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean)
  .map(l=>l.length>ORDER_DIAGNOSTICS.agentLineChars?l.slice(0,ORDER_DIAGNOSTICS.agentLineChars-1)+'…':l);
 return ['',`## Errors (last ${ORDER_DIAGNOSTICS.errorHours} hour, UTC, oldest first)`,...(d.errors.length?d.errors:['(none)']),
  '','## Fox timings (last replies, UTC)',...(d.timings.length?d.timings:['(none)']),
  ...(agent.length?['','## Agent error log (newest lines)',...agent]:[])];
}
/** The inbox item (gatehouse/inbox.mjs cleanItem): the words first, then where the person was, the pictures
 * and the log. Throws when nothing was said. */
export function orderItem(f:OrderFacts){
 const said=f.said.trim().slice(0,SAID_CHARS);
 if(!said)throw Error('Nothing was said.');
 if(!/^[a-f0-9]{8}$/.test(f.id))throw Error('Invalid task id.');
 const stamp=f.at.toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
 const frames=f.frames.slice(0,ORDER_FRAMES),files=orderFiles(f.files??[]);
 const head=['## What was said',said,'',
  '## Where',`Worldlet ${f.version} (Build ${f.build}) · ${f.channel} · ${f.platform} · ${f.at.toISOString().slice(0,19)}Z`,
  ...(f.place?[f.place]:[]),
  ...(f.diagnostics?[`System ${f.diagnostics.system}${f.diagnostics.installation?` · installation ${f.diagnostics.installation}`:''}`]:[]),
  ...(frames.length?['','## Screenshots',...frames.map((s,n)=>`- screenshot ${n}: ${s.label}`)]:[]),
  ...(files.length?['','## Log files (whole, newest part of each; inbox_claim lists each with its machineUrl)',...files.map(x=>`- ${x.name} (${utf8(x.text)} bytes)`)]:[]),
  ...(f.diagnostics?diagnosticSections(f.diagnostics):[]),
  '',`## Operation log (last ${ORDER_LOG.minutes} minutes, UTC, oldest first)`].join('\n');
 // The newest log lines matter most: when the text is too long the oldest go first.
 const log=[...f.log];let body='';
 do{body=head+'\n'+(log.length?log.join('\n'):'(nothing recorded)');}while(body.length>BODY_CHARS&&log.shift()!==undefined);
 const first=said.split('\n')[0];
 return {source:'order',sourceId:`order.${stamp}.${f.id}`,createdAt:f.at.toISOString(),
  title:first.length>110?first.slice(0,109)+'…':first,body:orderRedact(body.slice(0,BODY_CHARS)),
  frames:frames.map(s=>({at:0,jpeg:s.jpeg})),...(files.length?{files}:{})};
}

// The owner's Claude project conversation (owner decision 2026-10-05: "直接发到这个项目的对话"): after the item is stored,
// the app runs `claude -p <message> --cloud <session>` with that computer's own Claude Code sign-in, which wakes the
// project's coordinator session at once. The coordinator is replaced from time to time, so the app asks admin at send
// time which sessions to try (gatehouse/order-target.mjs: the recorded coordinator while alive, live
// coordinators from their heartbeats, then the recorded one anyway) and tries them in turn until one takes it (owner 2026-10-07: 「它应该永远能发成功啊」).
// WORLDLET_ORDER_SESSION on that computer comes first; this reviewed constant is the last resort when admin has none
// or cannot be reached. When every send fails the hourly report still claims the item.
export const ORDER_PROJECT_SESSION='session_018APNTfnWESXhaMzrQ7eaof';
/** How many sessions one Order tries before it gives up on waking Claude. */
export const ORDER_TRIES=4;
const SESSION=/^(?:session|cse)_[A-Za-z0-9]{10,80}$/;
const valid=(id:unknown):id is string=>typeof id==='string'&&SESSION.test(id);
/** The sessions to try, in order: the computer's override alone, else admin's candidates (well-formed, each once, at
 * most ORDER_TRIES), else the constant. */
export function orderSessions(override?:string,admin?:unknown):string[] {
 if(valid(override))return [override];
 const list=[...new Set((Array.isArray(admin)?admin:[admin]).filter(valid))].slice(0,ORDER_TRIES);
 return list.length?list:[ORDER_PROJECT_SESSION];
}
/** The project message: the words, where, and the inbox item that holds the pictures and the log (or that there is
 * none). Bounded well under the CLI's 64 KiB. */
export function orderMessage({said,at,channel,version,build,place,item,screenshots}:{said:string;at:Date;channel:UpdateChannel;version:string;build:number;place?:string;item:string|null;screenshots:number}){
 const words=said.trim().slice(0,SAID_CHARS);
 return orderRedact([`Order: Kelvin said this in Worldlet ${version} (Build ${build}, ${channel}) at ${at.toISOString().slice(0,16)}Z${place?`, in ${place}`:''}:`,'',words,'',
  item?`Admin inbox item ${item} holds it with ${screenshots} screenshot${screenshots===1?'':'s'}, the last ${ORDER_LOG.minutes} minutes of the operation log and this computer's recent errors, Fox timings and whole log files (inbox_claim {"source":"order"}; screenshots and log files at each one's machineUrl).`
   :'The admin inbox did not take it, so there are no screenshots or log this time.'].join('\n'));
}
