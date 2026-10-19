import {BOARD_BLOCK_KINDS,BOARD_DEFINE_PRESETS,BOARD_LIMITS,type BoardReadArgs,type BoardRecord,type BoardBlock,type BoardBlockKind,type BoardBlockView,type BoardDefinition,type BoardFunnelStep,type BoardFunnelStepView,type BoardListItem,type BoardPoint,type BoardTab,type BoardTone,type BoardView} from '../../contracts/board.ts';
import {WORLD_PRESET_PROVIDERS,type ServicePreset} from '../../contracts/service-presets.ts';
import {SERVICE_PROVIDERS,type ServiceRecords} from '../../contracts/services.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import {looksSecret} from '../items/index.ts';
import {saveServicePreset} from '../accounts/index.ts';

/** What a board block may show: a Service's live read, or the World's own records (`agents`). A Notion preset is
 * collected for the person, not read live, so the board refuses it. */
export const BOARD_PROVIDERS:readonly string[]=Object.freeze([...SERVICE_PROVIDERS,...WORLD_PRESET_PROVIDERS]);

/** The board (contracts/board.ts, context/board/README.md). Pure: the host supplies the definition, the saved presets and
 * each preset's Service read (or why it could not be read), and shows what comes back. No model is involved: every
 * value is a field the read returned, and every block that cannot be shown says why in plain words. */

export const BOARD_REASONS=Object.freeze({
 invalid:'This board is not valid.',
 collection:'This preset collects World context and is not supported on the board yet.',
 id:`Name each tab and block with lowercase letters, digits and -, at most ${BOARD_LIMITS.id}.`,
 duplicate:'Each tab and each block needs its own ID.',
 title:`Give it a title of up to ${BOARD_LIMITS.title} characters on one line.`,
 kind:`A block shows ${BOARD_BLOCK_KINDS.join(', ')}.`,
 field:`Name a field of up to ${BOARD_LIMITS.field} characters, as the read returns it.`,
 secret:'A board may not hold passwords, tokens or keys.',
 control:'A board may not hold control characters.',
 stale:'The board changed since it was read. Read it again (board/read) and define it at that revision.',
 tab:'This board has no such tab.',
 presets:`Save at most ${BOARD_DEFINE_PRESETS} presets with one definition.`,
 size:`A board has at most ${BOARD_LIMITS.tabs} tabs, ${BOARD_LIMITS.blocksPerTab} blocks a tab, ${BOARD_LIMITS.blocks} blocks and ${BOARD_LIMITS.presets} presets in all.`,
});

const ID=new RegExp(`^[a-z0-9][a-z0-9-]{0,${BOARD_LIMITS.id-1}}$`);
/** Service preset IDs (contracts/service-presets.ts). */
const PRESET_ID=/^[a-z0-9][a-z0-9-]{0,47}$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(BOARD_REASONS.invalid);};
const cut=(text:string,limit:number)=>[...text].length>limit?[...text].slice(0,limit-1).join('')+'…':text;

function line(value:unknown,limit:number,reason:string):string {
 if(typeof value!=='string')return fail(reason);
 if(CONTROL.test(value))fail(BOARD_REASONS.control);
 const clean=value.trim();
 if(!clean||[...clean].length>limit)fail(reason);
 if(looksSecret(clean))fail(BOARD_REASONS.secret);
 return clean;
}
const id=(value:unknown)=>typeof value==='string'&&ID.test(value)?value:fail(BOARD_REASONS.id);
const field=(value:unknown)=>line(value,BOARD_LIMITS.field,BOARD_REASONS.field);
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:fail(BOARD_REASONS.invalid);

/** What each kind takes besides id, title, kind and preset. */
const KIND_KEYS:Record<BoardBlockKind,string[]>={number:['field','goodAtLeast','goodAtMost'],funnel:['steps'],list:['fields','limit'],trend:['x','y']};

function readBlock(input:unknown):BoardBlock {
 const value=record(input);
 const kind=value.kind as BoardBlockKind;
 if(!BOARD_BLOCK_KINDS.includes(kind))fail(BOARD_REASONS.kind);
 only(value,['id','title','kind','preset',...KIND_KEYS[kind]]);
 if(typeof value.preset!=='string'||!PRESET_ID.test(value.preset))fail('Name the Service preset the block shows by its ID.');
 const block:BoardBlock={id:id(value.id),title:line(value.title,BOARD_LIMITS.title,BOARD_REASONS.title),kind,preset:value.preset as string};
 if(kind==='number'){
  if(value.field!==undefined)block.field=field(value.field);
  if(value.goodAtLeast!==undefined)block.goodAtLeast=finite(value.goodAtLeast);
  if(value.goodAtMost!==undefined)block.goodAtMost=finite(value.goodAtMost);
  if(block.goodAtLeast!==undefined&&block.goodAtMost!==undefined&&block.goodAtLeast>block.goodAtMost)fail('goodAtLeast must not be above goodAtMost.');
 }
 if(kind==='funnel'){
  if(!Array.isArray(value.steps)||value.steps.length<2||value.steps.length>BOARD_LIMITS.steps)fail(`A funnel has 2 to ${BOARD_LIMITS.steps} steps.`);
  block.steps=(value.steps as unknown[]).map((entry):BoardFunnelStep=>{
   const step=record(entry);only(step,['field','label','goodAtLeast']);
   const read:BoardFunnelStep={field:field(step.field),label:line(step.label??step.field,BOARD_LIMITS.title,BOARD_REASONS.title)};
   if(step.goodAtLeast!==undefined){
    const least=finite(step.goodAtLeast);
    if(least<0||least>1)fail('A funnel step’s goodAtLeast is a rate from 0 to 1.');
    read.goodAtLeast=least;
   }
   return read;
  });
  if(block.steps[0].goodAtLeast!==undefined)fail('The first funnel step has no rate, so it takes no goodAtLeast.');
  if(new Set(block.steps.map(step=>step.field)).size!==block.steps.length)fail('Each funnel step reads its own field.');
 }
 if(kind==='list'){
  if(value.fields!==undefined){
   if(!Array.isArray(value.fields)||value.fields.length>BOARD_LIMITS.fields)fail(`A list shows up to ${BOARD_LIMITS.fields} fields.`);
   block.fields=(value.fields as unknown[]).map(field);
   if(new Set(block.fields).size!==block.fields.length)fail(BOARD_REASONS.invalid);
  }
  if(value.limit!==undefined){
   if(!Number.isInteger(value.limit)||(value.limit as number)<1||(value.limit as number)>BOARD_LIMITS.list)fail(`A list shows 1 to ${BOARD_LIMITS.list} records.`);
   block.limit=value.limit as number;
  }
 }
 if(kind==='trend'){block.x=field(value.x);block.y=field(value.y);}
 return block;
}

/** A board definition, checked: its size, unique IDs, and each block's kind with only what that kind takes. Presets are
 * named, not checked here: a block whose preset is missing shows that when it is resolved. */
export function readBoardDefinition(input:unknown):BoardDefinition {
 const value=record(input);only(value,['title','tabs']);
 if(!Array.isArray(value.tabs)||!value.tabs.length||value.tabs.length>BOARD_LIMITS.tabs)fail(BOARD_REASONS.size);
 const tabs=(value.tabs as unknown[]).map((entry):BoardTab=>{
  const tab=record(entry);only(tab,['id','title','blocks']);
  if(!Array.isArray(tab.blocks)||tab.blocks.length>BOARD_LIMITS.blocksPerTab)fail(BOARD_REASONS.size);
  return {id:id(tab.id),title:line(tab.title,BOARD_LIMITS.title,BOARD_REASONS.title),blocks:(tab.blocks as unknown[]).map(readBlock)};
 });
 const blocks=tabs.flatMap(tab=>tab.blocks);
 if(blocks.length>BOARD_LIMITS.blocks||new Set(blocks.map(block=>block.preset)).size>BOARD_LIMITS.presets)fail(BOARD_REASONS.size);
 if(new Set(tabs.map(tab=>tab.id)).size!==tabs.length||new Set(blocks.map(block=>block.id)).size!==blocks.length)fail(BOARD_REASONS.duplicate);
 return {title:value.title===undefined?'Board':line(value.title,BOARD_LIMITS.title,BOARD_REASONS.title),tabs};
}

/** The presets a board reads, each once, in the order its blocks first name them; `tab` narrows it to one tab. */
export function boardPresetIds(definition:BoardDefinition,tab?:string):string[] {
 return [...new Set(definition.tabs.filter(item=>tab===undefined||item.id===tab).flatMap(item=>item.blocks.map(block=>block.preset)))];
}

/** What a preset's read gave: its records, or why it could not be read (the Service's own words, or the host's: not
 * connected, not allowed for this Agent). */
export type BoardRead={records:ServiceRecords}|{error:string};

/** A number a read returned: a finite number, or a string that is only a decimal number (HogQL may send big counts
 * as text). */
export function boardNumber(value:unknown):number|null {
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value.trim())){const n=Number(value.trim());return Number.isFinite(n)?n:null;}
 return null;
}
const rate=(part:number,whole:number)=>whole>0?Math.round(part/whole*1000)/1000:null;

/** One block from its preset's read; throws the plain reason it cannot be shown. */
function showBlock(block:BoardBlock,records:ServiceRecords):Partial<BoardBlockView> {
 const rows=Array.isArray(records.records)?records.records:[];
 const has=(row:typeof rows[number]|undefined,name:string)=>!!row&&Object.hasOwn(row.fields??{},name);
 const numberOf=(row:typeof rows[number]|undefined,name:string)=>{
  if(!row)return fail('The read returned nothing.');
  if(!has(row,name))return fail(`The read has no field “${cut(name,BOARD_LIMITS.field)}”.`);
  const n=boardNumber(row.fields[name]);
  return n===null?fail(`“${cut(name,BOARD_LIMITS.field)}” is not a number.`):n;
 };
 if(block.kind==='number'){
  const value=block.field===undefined?rows.length:numberOf(rows[0],block.field);
  const good=(block.goodAtLeast===undefined||value>=block.goodAtLeast)&&(block.goodAtMost===undefined||value<=block.goodAtMost);
  return {number:{value,...block.goodAtLeast!==undefined||block.goodAtMost!==undefined?{tone:good?'good':'bad'}:{}}};
 }
 if(block.kind==='funnel'){
  const counts=(block.steps??[]).map(step=>numberOf(rows[0],step.field));
  return {funnel:{steps:(block.steps??[]).map((step,i):BoardFunnelStepView=>{
   const stepRate=i?rate(counts[i],counts[i-1]):null;
   return {label:step.label,count:counts[i],rate:stepRate,...step.goodAtLeast!==undefined&&stepRate!==null?{tone:stepRate>=step.goodAtLeast?'good':'bad'}:{}};
  }),overall:rate(counts[counts.length-1],counts[0])}};
 }
 if(block.kind==='list'){
  const limit=block.limit??BOARD_LIMITS.listDefault;
  const items=rows.slice(0,limit).map((row):BoardListItem=>({title:row.title,url:row.url,
   fields:Object.fromEntries((block.fields??[]).filter(name=>has(row,name)).map(name=>[name,row.fields[name]]))}));
  return {list:{items,more:rows.length>limit||!!records.cursor}};
 }
 const points=rows.slice(0,BOARD_LIMITS.points).map((row):BoardPoint=>{
  if(!has(row,block.x!))return fail(`The read has no field “${cut(block.x!,BOARD_LIMITS.field)}”.`);
  const x=row.fields[block.x!];
  return {x:cut(String(x),BOARD_LIMITS.title),y:numberOf(row,block.y!)};
 });
 if(!points.length)fail('The read returned nothing.');
 const latest=points[points.length-1].y;
 return {trend:{points,latest,change:points.length>1?latest-points[points.length-2].y:null}};
}

/** The board as it shows: every tab (or only `tab`) with each block's value from its preset's read, or its error. A
 * block whose preset is missing, whose read failed or was refused, or whose fields are not in the read shows why;
 * the other blocks are unaffected. */
export function resolveBoard(definition:BoardDefinition,presets:readonly ServicePreset[],reads:Readonly<Record<string,BoardRead>>,now:string,tab?:string):BoardView {
 const tabs=definition.tabs.filter(item=>tab===undefined||item.id===tab).map(item=>({id:item.id,title:item.title,blocks:item.blocks.map((block):BoardBlockView=>{
  const base={id:block.id,title:block.title,kind:block.kind,preset:block.preset};
  const preset=presets.find(entry=>entry.id===block.preset);
  if(!preset)return {...base,status:'error',error:`No Service preset named “${block.preset}”. Save it first.`};
  const read=Object.hasOwn(reads,block.preset)?reads[block.preset]:null;
  if(!read)return {...base,provider:preset.provider,status:'error',error:'This preset was not read.'};
  if('error' in read)return {...base,provider:preset.provider,status:'error',error:cut(String(read.error||'The Service could not be read.'),BOARD_LIMITS.error)};
  try{return {...base,provider:preset.provider,scope:read.records.scope,status:'ok',...showBlock(block,read.records)};}
  catch(error){return {...base,provider:preset.provider,scope:read.records.scope,status:'error',error:error instanceof Error&&error.message?error.message:'This block cannot be shown.'};}
 })}));
 return {title:definition.title,tabs,resolvedAt:now};
}

/** `board/read` arguments: nothing, or one tab's ID. */
export function readBoardReadArgs(input:unknown,definition?:BoardDefinition):BoardReadArgs {
 const value=record(input);only(value,['tab']);
 if(value.tab===undefined)return {};
 const tab=id(value.tab);
 if(definition&&!definition.tabs.some(item=>item.id===tab))fail(BOARD_REASONS.tab);
 return {tab};
}

/** `board/define`: the whole new definition at the revision it was read at (0 with no board yet), and any presets to
 * save with it, each checked as the person's own would be. Returns the board to keep, its revision one higher and
 * stamped with the defining Agent (`agentId`, from its token; null for the person), and every preset after the save.
 * Refused, with nothing changed, when anything in it is not valid or the revision is stale. */
export function defineBoard(current:BoardRecord|null,presets:readonly ServicePreset[],input:unknown,agentId:string|null,now:string):{board:BoardRecord;presets:ServicePreset[]} {
 const value=record(input);only(value,['definition','presets','expectedRevision']);
 if(!Number.isFinite(Date.parse(now))||agentId!==null&&!AGENT_ID_PATTERN.test(agentId))fail(BOARD_REASONS.invalid);
 if(value.expectedRevision!==(current?.revision??0))fail(BOARD_REASONS.stale);
 const definition=readBoardDefinition(value.definition);
 let saved=[...presets];
 if(value.presets!==undefined){
  if(!Array.isArray(value.presets)||value.presets.length>BOARD_DEFINE_PRESETS)fail(BOARD_REASONS.presets);
  for(const input of value.presets as unknown[]){
   const result=saveServicePreset(saved,input,now);
   if(!BOARD_PROVIDERS.includes(result.preset.provider))fail(BOARD_REASONS.collection);
   saved=result.presets;
  }
 }
 if(saved.some(preset=>boardPresetIds(definition).includes(preset.id)&&!BOARD_PROVIDERS.includes(preset.provider)))fail(BOARD_REASONS.collection);
 return {board:{definition,revision:(current?.revision??0)+1,updatedAt:now,...agentId?{agentId}:{}},presets:saved};
}

/** The stored board, checked again; null when there is none or it no longer passes. */
export function readStoredBoard(value:unknown):BoardRecord|null {
 const v=record(value);
 if(!Number.isInteger(v.revision)||(v.revision as number)<1||typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt)))return null;
 try{
  return {definition:readBoardDefinition(v.definition),revision:v.revision as number,updatedAt:v.updatedAt,
   ...typeof v.agentId==='string'&&AGENT_ID_PATTERN.test(v.agentId)?{agentId:v.agentId}:{}};
 }catch{return null;}
}

/** The board's north-star number, which the World draws on the board's device: the first tab's first `number` block,
 * when it shows a value. Null with no board, no number block on the first tab, a read of another tab only, or an error
 * on that block (the device then stays empty, as with no board). */
export function boardNorthStar(read:{definition?:BoardDefinition|null;view?:BoardView|null}|null|undefined):{title:string;value:number;tone?:BoardTone}|null {
 const first=read?.definition?.tabs?.[0]?.id,tab=first===undefined?undefined:read?.view?.tabs?.find(item=>item.id===first);
 const block=tab?.blocks.find(item=>item.kind==='number');
 if(!block||block.status!=='ok'||!block.number||!Number.isFinite(block.number.value))return null;
 return {title:block.title,value:block.number.value,...block.number.tone?{tone:block.number.tone}:{}};
}

/** A board number as people read it: grouped, at most two decimals; `compact` (the device) shortens it to 1.2K. */
export function formatBoardNumber(value:number,compact=false):string {
 if(!Number.isFinite(value))return '—';
 return new Intl.NumberFormat('en-US',compact?{notation:'compact',maximumFractionDigits:1}:{maximumFractionDigits:2}).format(value);
}

/** A rate (0 to 1) as a percentage: whole under normal use, one decimal below 10%; a dash when there is none. */
export function formatBoardRate(rate:number|null|undefined):string {
 if(typeof rate!=='number'||!Number.isFinite(rate))return '—';
 const percent=rate*100;
 return (percent<10&&!Number.isInteger(percent)?percent.toFixed(1):String(Math.round(percent)))+'%';
}

/** How a number block's tone is said, never by colour alone. */
export const BOARD_TONE_WORDS:Readonly<Record<BoardTone,string>>=Object.freeze({good:'On target',bad:'Off target'});
