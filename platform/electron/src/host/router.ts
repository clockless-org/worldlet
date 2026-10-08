import crypto from 'node:crypto';
import {core} from '../core.ts';
import {WorldletError} from '../files.ts';
import type {ActionHandler,Host,RequestContext,Row} from './types.ts';
import type {WebContents} from 'electron';

const ITEM=['worldItemRead','worldItemStatus'];
const BROWSER_SURFACE=['browserShow','browserLayout','browserHide','browserPip'];
const FOX=['agentChat','agentSteer','agentCancel','hermesChat','hermesSteer','hermesCancel'];
/** The one entry for every `worldletHost.request`. Shared request validators run before any
 * handler, exactly as on the earlier native hosts; unknown actions fail explicitly. */
export class HostRouter {
 private actions=new Map<string,ActionHandler>();
 private host:()=>Host;
 constructor(host:()=>Host){this.host=host;}
 register(actions:Record<string,ActionHandler>){
  for(const [name,handler] of Object.entries(actions)){
   if(this.actions.has(name))throw Error(`Host action registered twice: ${name}`);
   this.actions.set(name,handler);
  }
 }
 has(action:string){return this.actions.has(action);}
 names(){return [...this.actions.keys()].sort();}
 async dispatch(body:unknown,sender:WebContents):Promise<unknown> {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new WorldletError('Invalid application request.');
  const request=body as Row;
  const action=request.action;
  if(typeof action!=='string')throw new WorldletError('Invalid application request.');
  const host=this.host();
  const requestId=crypto.randomUUID().toUpperCase();
  // Every World action crosses here, so the world's own history is taken before it runs:
  // an action that fails is still recorded as asked for.
  host.store.recordWorldAction(action,request,requestId);
  try{
   if(ITEM.includes(action))core('itemHostRequest',request);
   if(action==='browserOutcomeAction')core('browserOutcomeRequest',request);
   if(BROWSER_SURFACE.includes(action))core('browserSurfaceRequest',request);
   if(FOX.includes(action))core('foxHostRequest',request);
   const handler=this.actions.get(action);
   if(!handler)throw new WorldletError(`This Worldlet build does not support “${action}”. Update the app.`);
   const context:RequestContext={requestId,sender};
   const result=await handler(request as any,context);
   host.store.recordWorldAction(action,request,requestId,'succeeded');
   return result===undefined?{ok:true}:result;
  }catch(error){
   host.store.recordWorldAction(action,request,requestId,'failed');
   throw error;
  }
 }
}
