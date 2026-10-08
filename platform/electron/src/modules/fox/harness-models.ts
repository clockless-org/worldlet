import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {WorldletError} from '../../files.ts';
import {appletAgentThread,appletModelFor,chooseAppletModel,harnessService,harnessSessionThread,isHarnessModelId,readAppletModels} from '../../../../../core/agent/index.ts';
import type {HarnessModel} from '../../../../../contracts/harness-services.ts';

// Which of the same Agent's models answers in an Applet's thread (owner parity plan, 2026-10-08: Fox uses the Agent's
// own sign-in and model; an Applet that needs less can use a cheaper one of them). Whatever Harness Fox talks through,
// when it declares the `models` service (core `harnessService`), the person picks one per Applet from the Applet's menu,
// next to Answered by; its chat turns then carry `harnessModel`, and the adapter switches that thread's session to it.
// Nothing here knows which Harness it is. The choice is kept per Harness in world.sqlite (`applet-models`).

const KEY='applet-models';
export function createHarnessModels(host:Host,{warm}:{warm:(thread:string)=>Promise<unknown>}){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 /** The Harness and the models it lists for `agent`. An Agent that learns them from a session (Hermes Agent's
  * `session/new`) has none until one is open: for the menu, the Applet's thread (`ask`, its chat place) is warmed to ask. */
 async function found(agent?:string,ask:string|null=null):Promise<{harness:string;models:HarnessModel[]}|null> {
  const service=host.optional<AgentService>(AGENT),harness=service?.harness,models=service?.models?.();
  if(!harness||!models||harnessService(harness.id,'models')===null)return null;
  let listed=await models.list(agent);
  if(!listed.length&&ask){await warm(ask).catch(()=>{});listed=await models.list(agent);}
  return {harness:harness.id,models:listed.slice(0,60)};
 }
 return {
  /** The models and the one answering `applet`'s thread (null: the Agent's own). */
  async list(applet:unknown,agent?:string):Promise<Row> {
   const here=own()&&typeof applet==='string'?await found(agent,JSON.stringify(['object:'+applet,''])):null;
   if(!here)return {models:[],chosen:null};
   const thread=typeof applet==='string'?appletAgentThread(applet):null;
   const chosen=thread?appletModelFor(store.ledger().setting(KEY),here.harness,JSON.stringify(['object:'+applet,'']),here.models)??null:null;
   return {models:here.models.map(({id,name,current})=>({id,name,...current?{current:true}:{}})),chosen};
  },
  async choose(applet:unknown,model:unknown,agent?:string):Promise<Row> {
   if(!own())throw new WorldletError('Choose a model in your own world.');
   const here=typeof applet==='string'?await found(agent,JSON.stringify(['object:'+applet,''])):null;
   if(!here||typeof applet!=='string')throw new WorldletError('Your Agent has no other models to choose from.');
   const picked=model===null||model===undefined?null:here.models.find(item=>isHarnessModelId(model)&&item.id===model);
   if(picked===undefined)throw new WorldletError('Choose one of your Agent’s models.');
   const ledger=store.ledger();
   ledger.saveSetting(KEY,chooseAppletModel(ledger.setting(KEY),here.harness,applet,picked?picked.id:null) as unknown as Row);
   return {ok:true,chosen:picked?picked.id:null};
  },
  /** The model for a chat turn said in `thread` (the chat's place thread) on `agent`, when one is chosen. Before the
   * Agent has listed its models (no session open yet) the choice goes as kept; the session switches only to a model
   * its Agent lists. */
  async forTurn(thread:string,agent?:string):Promise<string|undefined> {
   if(!own())return undefined;
   const saved=store.ledger().setting(KEY);
   if(!saved||!Object.keys(readAppletModels(saved).choices).length)return undefined;
   try{
    const here=await found(agent);
    if(!here)return undefined;
    return here.models.length?appletModelFor(saved,here.harness,thread,here.models):readAppletModels(saved).choices[here.harness]?.[harnessSessionThread(thread)];
   }
   catch(error){host.diagnostics.record(error,'harnessModels');return undefined;}
  },
 };
}
