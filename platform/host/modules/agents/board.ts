import {BOARD_PROVIDERS,BOARD_REASONS,boardPresetIds,defineBoard,readBoardReadArgs,readStoredBoard,resolveBoard,type BoardRead} from '../../../../context/connectors/index.ts';
import {servicePresetRead} from '../../../../context/connectors/index.ts';
import {contextReader,type AgentContext} from '../../../../context/store/index.ts';
import {ledgerContext} from '../../store/context-storage.ts';
import {agentBoardRecords} from '../../../../agent/gate/index.ts';
import type {AgentListEntry} from '../../../../contracts/agent-reports.ts';
import type {BoardRecord} from '../../../../contracts/board.ts';
import type {ServicePreset} from '../../../../contracts/service-presets.ts';
import type {ServiceRead,ServiceRecords} from '../../../../contracts/services.ts';
import {loadServicePresets,storeServicePresets,type PresetLedger} from '../sources/service-presets.ts';
import type {Row} from './types.ts';

// The board (context/connectors/BOARD.md). Core checks and resolves; this keeps the board in the World's ledger (`state.board`
// in world.sqlite, beside the Service presets it names) and makes each preset's Service read, on this device, through
// the World's own Service readers, under each Service's own limits. An `agents` preset is answered from the World's own
// Agent reports (`agents/list`), with no Service and no network. No model is involved.

export type BoardLedger=PresetLedger&{board():Row|null;saveBoard(board:Row):void};
/** One Service read as `read_service` makes it, with no Agent and no turn: the World's own. */
export type ServiceReader=(read:ServiceRead)=>Promise<unknown>;
/** Every Agent the person has not revoked with its report, as `agents/list` returns them; null outside the person's own
 * World. */
export type AgentLister=()=>AgentListEntry[]|null;
export interface WorldBoard {
 /** One `world_board` call (`board/read`, `board/define`) by the Agent the Context entry admitted under its Grants. `canRead` says
  * whether this Agent's own Grants let it read a Service (`agents`, `list`: whether it may see other Agents): a block of
  * a source it may not read shows that, never the source's data. */
 call(agent:AgentContext,args:Row,canRead:(provider:string,operation:string)=>boolean):Promise<Row>;
 /** The board as the person sees it (host action `board`, `read`): every Service the World is connected to, and every
  * Agent's report. */
 view(request:Row):Promise<Row>;
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';
/** How long one preset's read is reused, so a board read again soon (several Agents, a page) asks the Service once. */
export const BOARD_READ_REUSE_MS=60_000;
/** Service reads one board resolve makes at once. */
const PARALLEL=4;

export function createWorldBoard({ledger,read,agents=()=>null,now=()=>new Date().toISOString(),clock=()=>Date.now()}:
 {ledger:()=>BoardLedger|null;read:ServiceReader;agents?:AgentLister;now?:()=>string;clock?:()=>number}):WorldBoard {
 const reused=new Map<string,{at:number;records:ServiceRecords}>();
 const stored=(db:BoardLedger):BoardRecord|null=>readStoredBoard(contextReader(ledgerContext(db)).bodies('board')[0]??null);
 /** Each named preset's read: from a recent read, or the Service now; why not, when it cannot be read. */
 async function reads(presets:readonly ServicePreset[],ids:readonly string[],canRead:(provider:string,operation:string)=>boolean):Promise<Record<string,BoardRead>> {
  const out:Record<string,BoardRead>={},queue=ids.flatMap(id=>{const preset=presets.find(item=>item.id===id);return preset?[preset]:[];});
  async function one(preset:ServicePreset){
   if(!BOARD_PROVIDERS.includes(preset.provider)){out[preset.id]={error:BOARD_REASONS.collection};return;}
   if(preset.provider==='agents'){
    // The World's own records: read each time (nothing to reuse), and only for a caller that may see other Agents.
    if(!canRead('agents','list')){out[preset.id]={error:'This Agent may not see other Agents. The person can allow it in Settings › Agents.'};return;}
    try{
     const entries=agents();
     out[preset.id]=entries?{records:agentBoardRecords(entries,preset.read)}:{error:'The Agents\' reports are kept in the person\'s own World, which is not ready.'};
    }catch(error){out[preset.id]={error:error instanceof Error&&error.message?error.message:'The Agents\' reports could not be read.'};}
    return;
   }
   if(!canRead(preset.provider,preset.read.operation)){out[preset.id]={error:'This Agent may not read this Service. The person can allow it in Settings › Agents.'};return;}
   const request=servicePresetRead(preset),key=JSON.stringify(request),hit=reused.get(key);
   if(hit&&clock()-hit.at<BOARD_READ_REUSE_MS){out[preset.id]={records:hit.records};return;}
   try{
    const answer=await read(request) as ServiceRecords;
    if(!answer||typeof answer!=='object'||!Array.isArray(answer.records))throw new Error('The Service returned an unsupported answer.');
    reused.set(key,{at:clock(),records:answer});out[preset.id]={records:answer};
   }catch(error){out[preset.id]={error:error instanceof Error&&error.message?error.message:'The Service could not be read.'};}
  }
  const workers=Array.from({length:Math.min(PARALLEL,queue.length)},async()=>{for(let preset=queue.shift();preset;preset=queue.shift())await one(preset);});
  await Promise.all(workers);
  return out;
 }
 async function show(db:BoardLedger,input:Row,canRead:(provider:string,operation:string)=>boolean):Promise<Row> {
  const board=stored(db),presets=loadServicePresets(db);
  if(!board)return {revision:0,definition:null,presets:[],view:null,guidance:'There is no board yet. Define one with board/define at expectedRevision 0.'};
  const {tab}=readBoardReadArgs(input,board.definition),ids=boardPresetIds(board.definition,tab);
  const view=resolveBoard(board.definition,presets,await reads(presets,ids,canRead),now(),tab);
  return {revision:board.revision,updatedAt:board.updatedAt,...board.agentId?{definedBy:board.agentId}:{},definition:board.definition,
   presets:presets.filter(preset=>ids.includes(preset.id)),view};
 }
 const failure=(error:unknown)=>({error:error instanceof Error&&error.message?error.message:'Could not do that.'});
 return {
  async call(agent,args,canRead){
   const db=ledger(),agentId=agent.call.agentId;
   if(!db)return {error:NOT_READY};
   const {operation,...input}=args??{};
   try{
    if(operation==='read')return {...await show(db,input,canRead),untrustedContent:true};
    if(operation==='define'){
     const before=loadServicePresets(db),current=stored(db);
     const defined=defineBoard(current,before,input,agentId,now());
     const context=agent.writer(ledgerContext(db));
     context.transaction(()=>{storeServicePresets(context,before,defined.presets);context.write('board',{save:[defined.board as unknown as Row]});});
     return {ok:true,revision:defined.board.revision,guidance:'The person\'s board now shows this. Read it with board/read to see each block\'s value or error.'};
    }
    return {error:'Unknown board operation.'};
   }catch(error){
    if(error instanceof Error&&/changed since it was read/.test(error.message))return {...failure(error),revision:stored(db)?.revision??0};
    return failure(error);
   }
  },
  async view(request){
   const db=ledger();
   if(!db)throw new Error(NOT_READY);
   return show(db,{...request?.tab===undefined?{}:{tab:request.tab}},()=>true);
  },
 };
}
