import policy from './turn-trust.json' with {type:'json'};
import {worldToolCatalog} from '../tools/index.ts';
/** One model turn's trust. Once any tool returns untrusted content, writes in that turn are denied without a prompt. */
export type TurnTrust={untrustedSource:string|null};
const matches=(pattern:string,value:string)=>new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(value);
/** Fail closed: every tool result is untrusted unless the policy names it as local, user-owned data. */
export function readsUntrusted(tool:string,args:Record<string,unknown>={}):boolean{
 if(policy.trustedTools.includes(tool))return false;
 if(tool===policy.worldGatewayTool)return !policy.trustedWorldActions.some(pattern=>matches(pattern,`${args.target}/${args.action}`));
 return true;
}
/** Memory and skill writes persist into later turns, so they follow the same rule as external writes. */
export function persists(tool:string):boolean{
 return policy.persistentTools.includes(tool);
}
export function observeTool(trust:TurnTrust,tool:string,args:Record<string,unknown>={}):TurnTrust{
 return trust.untrustedSource||!readsUntrusted(tool,args)?trust:{untrustedSource:tool};
}
/** Writes that persist or reach outside Worldlet run automatically only while the turn is still trusted. */
export function writeDecision(trust:TurnTrust,writes:boolean):{allowed:true}|{allowed:false;reason:string}{
 return writes&&trust.untrustedSource?{allowed:false,reason:policy.denial}:{allowed:true};
}

/** Host side of the same rule (#407). Mac and Windows feed every Agent event of one
 * turn through `turnTrustObserve`; once untrusted content has entered the turn,
 * guarded local writes are denied with the shared denial. Direct user requests
 * execute without confirmation and return an undoable notice. Hosts own storage,
 * clocks and notice IDs; they never ask the model or the user to approve. */

/** Persistent or externally effective writes guarded by this rule (#404–#407 extend this list). */
export const GUARDED_WRITE_TOOLS=['update_world_item','archive_world_items','configure_world_check','manage_routines'] as const;
/** Durable writes with no host undo notice (#672): note edits, how Fox speaks and a
 * DoorDash cart. They follow the same untrusted-turn rule. Keyword intent in a caller
 * may narrow them further but never replaces this check. Handing work to an Applet task
 * (`start_applet_task`) is not on this list (owner decision 2026-10-08): the task inherits
 * the starting turn's untrusted state (turnTrustInherit) and runs under the person's own
 * words, so it can do only what this turn still could. */
export const TURN_GUARDED_WRITES=['create_content','patch_content','delete_content','restore_content','undo_content','set_worldlet_preference','use_doordash'] as const;
/** Only the speaking style persists into later turns' prompts; other preferences are display settings. */
const PREFERENCE_WRITES=['companion_style','morning_brief'];
/** DoorDash operations that change the user's cart. Search, list and checkout links are reads. */
const DOORDASH_WRITES=['cart_add','cart_remove'];
/** Routine operations that schedule unattended work (#404). Pause, remove, list and result always run. */
const ROUTINE_WRITES=['create','update','resume'];
/** World services whose results carry untrusted source text into the turn. Past conversations
 * (`read_companion_archive`) include lines brought from other Agents and channels: other
 * people's Telegram, Slack and email messages and coding sessions, so they are untrusted too. */
const UNTRUSTED_SERVICES=['read_world_source','read_connected_google','use_doordash','use_youtube','use_stripe_crm','meeting_decisions','read_companion_archive'];
/** Host tools that return source text. `query_world_items` is excluded: it returns
 * Worldlet's own saved items and is how a direct request finds item IDs. */
const UNTRUSTED_TOOLS=['read_content','read_content_page','open_content','read_world_history','meeting_decisions','read_companion_archive'];
/** Tools the host routes itself; their tool events above classify them precisely. */
const HOST_ROUTED=new Set<string>([policy.worldGatewayTool,...worldToolCatalog.map(tool=>tool.name)]);

export type HostTurnTrust={untrusted:boolean;sources:string[]};
type Event={type?:unknown;name?:unknown;args?:unknown;result?:unknown};

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==='string'?value:'';

function untrustedSource(event:Event):string|null {
 const type=text(event.type),name=text(event.name),args=record(event.args),result=record(event.result);
 if(result.untrustedContent===true)return name||'tool result';
 // Hermes-internal tools surface only as progress names; the shared policy fails closed for them.
 if(type==='progress')return name&&!HOST_ROUTED.has(name)&&readsUntrusted(name)?name:null;
 if(type!=='tool')return null;
 if(name==='_world_authorize'){
  // A routine's saved output was produced by an unattended run over email and web content.
  if(text(args.name)==='manage_routines')return text(args.action)==='result'?'manage_routines':null;
  return UNTRUSTED_SERVICES.includes(text(args.name))?text(args.name):null;
 }
 if(name==='_source_begin')return 'read_world_source';
 if(name==='_source_result')return args.failed===true?null:'read_world_source';
 if(UNTRUSTED_TOOLS.includes(name))return name;
 if(name==='browse_web'&&['read','records','record','outline'].includes(text(args.operation)))return name;
 if(name==='automate_browser'&&text(args.operation)==='snapshot')return name;
 return null;
}

/** The starting trust of a turn another turn started (an Applet task, a Moment Applet or
 * game maker). It carries the parent's untrusted content: a background task started after
 * a mail or web read never begins trusted, so text in that read cannot reach guarded
 * writes by handing them to a child turn. */
export function turnTrustInherit(parent:unknown):HostTurnTrust {
 const current=record(parent);
 const sources=Array.isArray(current.sources)?current.sources.filter((value):value is string=>typeof value==='string'):[];
 if(typeof current.untrustedSource==='string'&&!sources.includes(current.untrustedSource))sources.push(current.untrustedSource);
 return {untrusted:current.untrusted===true||typeof current.untrustedSource==='string',sources};
}

/** Folds one event into the turn state. Untrusted is sticky for the whole turn. */
export function turnTrustObserve(state:unknown,event:Event):HostTurnTrust {
 const current=record(state);
 const sources=Array.isArray(current.sources)?current.sources.filter(value=>typeof value==='string'):[];
 const source=untrustedSource(event);
 if(source&&!sources.includes(source))sources.push(source);
 return {untrusted:current.untrusted===true||source!==null,sources};
}

/** The guarded tool named by an event, including Hermes' pre-execution authorize. */
export function turnGuardedWrite(event:Event):string|null {
 if(text(event.type)!=='tool')return null;
 const name=text(event.name),args=record(event.args);
 const target=name==='_world_authorize'?text(args.name):name;
 // Hermes names the routine or DoorDash operation when authorizing; an unnamed one fails closed.
 if(target==='manage_routines'&&args.action!==undefined&&!ROUTINE_WRITES.includes(text(args.action)))return null;
 if(target==='use_doordash'&&args.operation!==undefined&&!DOORDASH_WRITES.includes(text(args.operation)))return null;
 if(target==='set_worldlet_preference'&&!PREFERENCE_WRITES.includes(text(args.setting)))return null;
 return [...GUARDED_WRITE_TOOLS,...TURN_GUARDED_WRITES].includes(target as never)?target:null;
}

/** One admission rule for every guarded write. `tool` is set only for the host writes
 * that take a snapshot and undo notice; the others are admitted or refused the same way. */
export function turnWriteAdmission(state:unknown,event:Event):{guarded:boolean;allowed:boolean;tool?:string;error?:string} {
 const target=turnGuardedWrite(event);
 if(!target)return {guarded:false,allowed:true};
 const tool=(GUARDED_WRITE_TOOLS as readonly string[]).includes(target)?target:undefined;
 const trust=turnTrustObserve(state,{});
 if(!trust.untrusted)return tool?{guarded:true,allowed:true,tool}:{guarded:true,allowed:true};
 const denials:Record<string,string>=policy.denials;
 return {guarded:true,allowed:false,...(tool?{tool}:{}),error:denials[target]??policy.denial};
}

/** Browser operations that act on a page (#671). Open, snapshot, scroll and receipts are unchanged. */
export const BROWSER_EFFECT_OPERATIONS=['do','click','fill','submit'] as const;
/** Webpage content never authorizes an external effect. Once untrusted content has
 * entered the turn, a browser click, fill or submit is checked against the element
 * (browserEffectDecision) before it runs: steps that move money, start a paid plan,
 * grant access or delete are refused automatically; nothing asks the person. Request
 * wording never changes the decision. */
export function turnBrowserAdmission(state:unknown,event:Event):{check:boolean} {
 const args=record(event.args);
 const acts=text(event.type)==='tool'&&text(event.name)==='automate_browser'&&(BROWSER_EFFECT_OPERATIONS as readonly string[]).includes(text(args.operation));
 return {check:acts&&turnTrustObserve(state,{}).untrusted};
}

type ItemSnapshot={id:string;status:unknown;statusOrigin:unknown;snoozedUntil?:unknown};
/** Status fields to capture before a guarded item write. */
export function worldItemSnapshot(item:Record<string,unknown>):ItemSnapshot {
 const snapshot:ItemSnapshot={id:text(item.id),status:item.status??'candidate',statusOrigin:item.statusOrigin??'agent'};
 if(item.snoozedUntil!==undefined)snapshot.snoozedUntil=item.snoozedUntil;
 return snapshot;
}
/** Undo restores the exact prior status, including `candidate`, which the update path cannot set. */
export function worldItemRestore(item:Record<string,unknown>,previous:ItemSnapshot,now:string):Record<string,unknown> {
 if(text(item.id)!==previous.id||!previous.id)throw Error('Undo no longer matches this item.');
 const result:Record<string,unknown>={...item,status:previous.status,statusOrigin:previous.statusOrigin,updatedAt:now};
 delete result.snoozedUntil;if(previous.snoozedUntil!==undefined)result.snoozedUntil=previous.snoozedUntil;
 return result;
}

export type WriteUndo={kind:'items';items:ItemSnapshot[]}|{kind:'check';request:{provider:string;enabled:boolean;intervalMinutes?:number}};
/** Notice and undo for a completed direct write. `before` is the host's snapshot:
 * item rows for item tools, the prior check row (or null) for configure_world_check. */
export function turnWriteNotice(tool:string,args:unknown,before:unknown):{text:string;undo:WriteUndo} {
 const input=record(args);
 if(tool==='update_world_item'||tool==='archive_world_items'){
  const rows=(Array.isArray(before)?before:[]).map(row=>worldItemSnapshot(record(row)));
  if(!rows.length)throw Error('Undo needs the saved items that were changed.');
  const status=text(input.status);
  const summary=tool==='archive_world_items'?`Archived ${rows.length} item${rows.length===1?'':'s'}.`
   :`Marked the item ${status||'updated'}.`;
  return {text:summary+' You asked for this directly, so it was done without a confirmation.',undo:{kind:'items',items:rows}};
 }
 if(tool==='configure_world_check'){
  const provider=text(input.provider);if(!provider)throw Error('Invalid source check configuration.');
  const prior=before&&typeof before==='object'?record(before):null;
  const request:{provider:string;enabled:boolean;intervalMinutes?:number}={provider,enabled:prior?.enabled===true};
  if(typeof prior?.intervalMinutes==='number')request.intervalMinutes=prior.intervalMinutes;
  const enabled=input.enabled===false?'Turned off':input.enabled===true?'Turned on':'Updated';
  const every=typeof input.intervalMinutes==='number'?` (every ${input.intervalMinutes} minutes)`:'';
  return {text:`${enabled} the ${provider} check${every}. You asked for this directly, so it was done without a confirmation.`,undo:{kind:'check',request}};
 }
 throw Error('Unknown guarded write.');
}
