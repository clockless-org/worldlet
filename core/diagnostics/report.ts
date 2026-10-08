import {foxTiming} from './fox-timing.ts';
const providers=new Set(['gmail','google-calendar','google-drive','notion','github','apple-notes','apple-reminders','youtube','doordash','codex','claude-code','folder','file','obsidian','paypal','stripe']);
const states=new Set(['connected','connecting','authorizing','syncing','reading','sync_error','disconnected','error']);
const operations=new Set(['agentChat','connect','appContent','worldItemSave','other','appletCheck','appletAnalysis','appletAnalysisQueue','appletBackpressure','attentionWake','attentionSynthesis','keptPageRelease','webEngineStall']);
/** Classified failure codes; analytics may report these and never the error text. */
export const ERROR_CODES=['offline','timeout','cancelled','authentication','quota','unavailable','operationFailed','evidenceMismatch','outputValidation','lowMemory','appFootprint','nativeCrash'];
const codes=new Set(ERROR_CODES);
const timestamp=value=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(value)&&Number.isFinite(Date.parse(value))?value:undefined;
const rows=value=>Array.isArray(value)?value:[];
function errorRow(row){
 const result:Record<string,unknown>={at:timestamp(row?.at),area:['native','browser','agent','connection'].includes(row?.area)?row.area:'native',code:codes.has(row?.code)?row.code:'operationFailed'};
 const id=foxTiming({id:row?.requestId})?.id;if(id)result.requestId=id;
 if(operations.has(row?.operation))result.operation=row.operation;
 if(typeof row?.nativeCode==='string'&&/^-?\d{1,12}$/.test(row.nativeCode))result.nativeCode=row.nativeCode;
 if(['NSURLErrorDomain','WebKitErrorDomain','WKErrorDomain','other'].includes(row?.nativeDomain))result.nativeDomain=row.nativeDomain;
 return result;
}
/** Native hosts supply OS/build facts; product schema and privacy live here. */
export function diagnosticReport(value){
 const build:Record<string,unknown>={};
 if(typeof value.build?.version==='string'&&/^\d+\.\d+\.\d+$/.test(value.build.version))build.version=value.build.version;
 if(Number.isSafeInteger(value.build?.build)&&value.build.build>=0)build.build=value.build.build;
 const platform=['macos','windows'].includes(value.platform)?value.platform:'unknown';
 const version=typeof value.systemVersion==='string'&&/^\d+(\.\d+){1,3}$/.test(value.systemVersion)&&value.systemVersion.length<40?value.systemVersion:'unknown';
 return {schema:2,generatedAt:timestamp(value.generatedAt),build,system:platform+' '+version,
  channel:value.channel==='development'?'development':'release',agentAvailable:value.agentAvailable===true,
  connections:rows(value.connections).slice(0,100).map(row=>({provider:providers.has(row?.provider)?row.provider:'other',status:states.has(row?.status)?row.status:'unknown'})),
  recentErrors:rows(value.recentErrors).slice(-50).map(errorRow),
  foxTimings:rows(value.foxTimings).slice(-100).map(foxTiming).filter(Boolean),
  scope:'Version, system, connection states, recent error codes and numeric timing traces, including unfinished requests. No account identifiers, paths, URLs, credentials, messages or raw logs. Nothing is uploaded.'};
}

/** Which rule rejected a model-written World item or Applet candidate, as a fixed tag. A background batch that saves
 * nothing re-throws its first rejection, and three of those on 2026-10-03 could not be traced to a rule from a code
 * alone (owner meeting with a heavy user). Evidence mismatches keep their own code. */
const ITEM_RULES:[RegExp,string][]=[
 [/attention (title|reason|summary|location|actionlabel)|attention needs model-written/,'attentionText'],[/non-calendar events need eventdisposition|invalid event disposition/,'eventDisposition'],
 [/invalid item ownership/,'ownership'],[/attention context changed/,'contextChanged'],[/invalid applet candidate/,'candidateField'],
 [/events need a date|invalid event end time/,'eventTime'],[/invalid world item: event|attention event /,'eventLabel'],
 [/attention (dueat|occurredat|sourceupdatedat) needs/,'attentionTime'],[/read sources in this turn/,'unread'],
 [/invalid world item|needs source references|invalid source link|invalid calendar projection/,'itemShape'],
];
export function itemRule(message:string){
 const text=message.toLowerCase();
 return text.includes('source evidence')?'evidence':ITEM_RULES.find(([pattern])=>pattern.test(text))?.[1]??'other';
}
/** Raw text is classification input only and never part of the returned record. */
export function diagnosticError(value){
 const message=typeof value.message==='string'?value.message.toLowerCase():'';
 const code=message.includes('source evidence')?'evidenceMismatch':value.cancelled===true?'cancelled':
  ITEM_RULES.some(([pattern])=>pattern.test(message))?'outputValidation':
  value.timedOut===true||/timed out|timeout|10060/.test(message)?'timeout':
  /unauthorized|invalid_grant|authoriz|sign-in/.test(message)?'authentication':
  /quota|rate limit|allowance/.test(message)?'quota':
  /offline|network unreachable|name resolution/.test(message)?'offline':
  /interrupt|worldlet_service_credits|worldlet_model_paused|worldlet_update_required|included ai service needs a billing update|included ai is paused/.test(message)?'unavailable':
  // The person's model service failing after Hermes's own retries (HTTP 5xx), not a Worldlet fault: background checks
  // on 10-07 counted these as operationFailed.
  /model service is unavailable|internal ?server ?error|bad gateway|service unavailable|\b(?:http|error code:?) 5\d\d\b/.test(message)?'unavailable':
  // A kept website page released under memory pressure (core/browser/page-resume.ts PAGE_MEMORY).
  message.includes('memory pressure (lowmemory)')?'lowMemory':message.includes('memory pressure (appfootprint)')?'appFootprint':'operationFailed';
 const operation=value.operation==='hermesChat'?'agentChat':value.operation;
 return errorRow({code,operation,requestId:value.requestId,area:value.area});
}

const ENVIRONMENTAL=new Set(['offline','timeout','cancelled','authentication','quota','unavailable','lowMemory','appFootprint']);
/** One V8 stack line → a frame of Worldlet's own code: function name, file basename, line and column. Paths, query
 * strings and anything that is not a plain identifier or file name are dropped, so no folder or user name leaves. */
function stackFrame(line:string){
 const match=/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
 if(!match)return null;
 const location=match[2].replace(/\\/g,'/').replace(/[?#].*$/,'');
 const name=location.slice(location.lastIndexOf('/')+1);
 const fn=(match[1]??'').replace(/^(async|new) /,'').replace(/ \[as [^\]]+\]$/,'');
 return {platform:'node:javascript',filename:/^[\w.-]{1,80}$/.test(name)?name:'other',function:/^[\w$.<>]{1,100}$/.test(fn)?fn:'?',
  lineno:Number(match[3]),colno:Number(match[4]),in_app:!/^(node:|internal\/)|node_modules|electron\/js2c|<anonymous>/.test(location)};
}
/** An uncaught or recorded error as a PostHog `$exception` projection: its type, Core's failure code and sanitized
 * frames (oldest first, as error tracking expects). The message is classification input only and is never returned. */
export function exceptionReport(value){
 const code=diagnosticError({message:value?.message,operation:value?.operation}).code as string;
 const type=typeof value?.name==='string'&&/^[A-Z][A-Za-z]{0,40}$/.test(value.name)?value.name:'Error';
 const frames=(typeof value?.stack==='string'?value.stack.split('\n').slice(1,41):[]).map(stackFrame).filter(Boolean).reverse();
 const area=['main','renderer','host'].includes(value?.area)?value.area:'host';
 const operation=typeof value?.operation==='string'&&/^[A-Za-z][\w:-]{0,60}$/.test(value.operation)?value.operation:'';
 return {type,code,area,operation,level:ENVIRONMENTAL.has(code)?'warning':'error',handled:area==='host',frames,
  ...(operation==='worldItemSave'?{rule:itemRule(typeof value?.message==='string'?value.message:'')}:{})};
}
