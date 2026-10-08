import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {WorldletError} from '../../files.ts';
import {AGENT_BINDING_SCOPES,agentAnswerReason,agentBindingInstructions,agentBindingPlace,answeringAgent,bindAgent,harnessService,harnessSessionThread,isHarnessAgentId,noteAgentPlace,readAgentBindings,type AgentBindingScope,type AgentPlaces} from '../../../../../core/agent/index.ts';
import {APPLET_REGION_TITLES,getApp,migrateAreaLayout} from '../../../../../core/applets/index.ts';
import {conversationAttentionId,readOngoing} from '../../../../../core/ongoing/index.ts';
import type {HarnessAgent} from '../../../../../contracts/harness-services.ts';

// Which of the person's own agents answers in a thread, and what extra it is told (owner goal 2026-10-08: what
// OpenClaw / Hermes Agent users do with several agents routed by channel and a system prompt per channel, Worldlet
// does too). From an Applet's menu the person binds an agent and extra instructions to the Applet, its area of the
// World or, for an Ongoing Applet that is a brought channel conversation, that person (a direct chat) or group (a
// shared one). Core `answeringAgent` picks one (person > group > Applet > area > the main agent); a chat turn there
// carries `harnessAgent`, which the adapter opens that thread's session on (HarnessSessionKey.agent), and the notes
// join the turn's instructions. Agents need a Harness that declares the `agents` service (core `harnessService`);
// notes work with any. Nothing here knows which Harness it is. Bindings live in world.sqlite (`applet-agents`).

const KEY='applet-agents';
type Here={harness:string;agents:HarnessAgent[]};
const NONE:Here={harness:'',agents:[]};
export function createHarnessAgents(host:Host){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 /** The Harness and its agents, or null when Fox's Agent has none to offer. */
 async function found():Promise<Here|null> {
  const service=host.optional<AgentService>(AGENT),harness=service?.harness;
  if(!harness||harnessService(harness.id,'agents')===null)return null;
  const agents=service?.agents?.();
  return agents?{harness:harness.id,agents:(await agents.list()).slice(0,50)}:null;
 }
 /** The places an Applet's thread is in: the Applet, its area (where the person moved it, else where it stands) and,
  * for a brought channel conversation kept as an Ongoing Applet, its person or group. */
 async function placesOf(applet:string):Promise<{places:AgentPlaces;area?:string}> {
  const places:AgentPlaces={},key=applet.replace(/^app-/,''),saved=store.state.onboarding?.regionLayout as Row|undefined,layout=saved&&migrateAreaLayout(saved);
  const thing=key.startsWith('job-')?store.ledger().ongoingRows().map(readOngoing).find(t=>t?.id===key&&t.state==='kept')??null:null;
  const applies=(scope:AgentBindingScope,id:string)=>{const place=agentBindingPlace(scope,id);if(place)places[scope]=place;};
  applies('applet',applet);
  const region=String((layout?.assignments as Row|undefined)?.[applet]??thing?.region??getApp(key)?.region??'').replace(/^building-/,'');
  applies('region',region);
  if(thing){
   const shared=store.ledger().historyShared(thing.source,thing.session),id=conversationAttentionId(thing.source,thing.session);
   // A direct conversation is a person's only when it is a channel chat its Agent can send to (not a terminal session).
   if(shared===true)applies('group',id);
   else if(shared===false){
    const send=host.optional<AgentService>(AGENT)?.channelSend?.(thing.source);
    for(const thread of send?store.ledger().historyThreads(thing.source,thing.session).slice(0,3):[])if(await send!.route(thread).catch(()=>null)){applies('person',id);break;}
   }
  }
  const named=(layout?.names as Row|undefined)?.[region];
  return {places,...places.region?{area:typeof named==='string'&&named?named:APPLET_REGION_TITLES[region as keyof typeof APPLET_REGION_TITLES]}:{}};
 }
 async function answer(applet:string,here:Here){
  const {places,area}=await placesOf(applet),saved=readAgentBindings(store.ledger().setting(KEY));
  return {places,area,saved,chosen:answeringAgent(saved,here.harness,places,here.agents)};
 }
 return {
  /** The agents, who answers `applet`'s thread and why, and what each place it is in binds (an agent, notes). */
  async list(applet:unknown):Promise<Row> {
   if(!own()||typeof applet!=='string')return {agents:[],chosen:null,places:[]};
   const here=await found()??NONE,{places,area,saved,chosen}=await answer(applet,here),bound=saved.choices[here.harness]??{};
   return {agents:here.agents.map(({id,name,model,main})=>({id,name,...model?{model}:{},...main?{main:true}:{}})),
    chosen:chosen.main?null:chosen.agent,
    ...chosen.agent?{answering:{agent:chosen.agent,name:here.agents.find(a=>a.id===chosen.agent)?.name??chosen.agent,by:chosen.by,reason:agentAnswerReason(chosen.by,area)}}:{},
    places:AGENT_BINDING_SCOPES.flatMap(scope=>{const place=places[scope];return place?[{scope,...scope==='region'&&area?{area}:{},...bound[place]?{agent:bound[place]}:{},...saved.notes[place]?{note:saved.notes[place]}:{}}]:[];})};
  },
  /** For one of the places `applet`'s thread is in (`scope`, the Applet by default): binds `agent` (null unbinds it,
   * undefined leaves it) and, when given, sets its notes. */
  async choose(applet:unknown,agent:unknown,scope:unknown='applet',note?:unknown):Promise<Row> {
   if(!own())throw new WorldletError('Choose an agent in your own world.');
   if(typeof applet!=='string')throw new WorldletError('Choose an Applet.');
   const here=agent===undefined?null:await found();
   if(agent!==undefined&&!here)throw new WorldletError('Your Agent has no other agents to choose from.');
   const picked=agent===undefined||agent===null?null:here!.agents.find(item=>isHarnessAgentId(agent)&&item.id===agent);
   if(picked===undefined)throw new WorldletError('Choose one of your agents.');
   const place=(await placesOf(applet)).places[(AGENT_BINDING_SCOPES as readonly unknown[]).includes(scope)?scope as AgentBindingScope:'applet'];
   if(!place)throw new WorldletError('This Applet is not in that place.');
   const ledger=store.ledger();
   let next:unknown=ledger.setting(KEY);
   try{if(here)next=bindAgent(next,here.harness,place,picked?.id??null);if(note!==undefined)next=noteAgentPlace(next,place,note);}
   catch(error){throw new WorldletError((error as Error).message);}
   ledger.saveSetting(KEY,readAgentBindings(next) as unknown as Row);
   return {ok:true,chosen:picked?.id??null};
  },
  /** For a chat turn said in `thread` (the chat's place thread): the agent when it is not the main one, and the notes
   * for where it is said, as turn instructions. */
  async forTurn(thread:string):Promise<{agent?:string;instructions:string}> {
   const none={instructions:''},session=harnessSessionThread(thread);
   if(!own()||!session.startsWith('applet:'))return none;
   const saved=readAgentBindings(store.ledger().setting(KEY));
   if(!Object.keys(saved.choices).length&&!Object.keys(saved.notes).length)return none;
   try{
    const here=Object.keys(saved.choices).length?await found():null,{chosen}=await answer('app-'+session.slice(7),here??NONE);
    return {...here&&!chosen.main?{agent:chosen.agent}:{},instructions:agentBindingInstructions(chosen.notes)};
   }catch(error){host.diagnostics.record(error,'harnessAgents');return none;}
  },
 };
}
