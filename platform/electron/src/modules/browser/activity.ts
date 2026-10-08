import crypto from 'node:crypto';
import {core} from '../../core.ts';
import type {WorldStore} from '../../store/world-store.ts';
import type {Row} from '../../host/types.ts';
/** Native IO only (Mac ActivityRecorder); activity schemas, redaction and timing live in Core.
 * A trusted surface (the World page) passes its fixed `url`: its bridge then reports page observations
 * as `ui.observation` events. A website surface has none, so a page cannot forge an observation. */
export class ActivityRecorder {
 private state:unknown=null;
 private readonly surfaceID=crypto.randomUUID().toUpperCase();
 private store:WorldStore;
 private readonly url?:string;
 constructor(store:WorldStore,url?:string){this.store=store;this.url=url;}
 observe({page,active,close=false,endReason}:{page?:Row,active:boolean,close?:boolean,endReason?:string}){
  try{
   const input:Row={id:crypto.randomUUID().toUpperCase(),surfaceId:this.surfaceID,at:Date.now()/1000,tick:performance.now(),active,close,state:this.state};
   if(page)input.page=page;
   if(endReason)input.endReason=endReason;
   const result=core('activityObserve',input);
   if(!Array.isArray(result?.events))return;
   this.persist(result.events);this.state=result.state??null;
  }catch(error){this.store.historyFailure(error,'activity');}
 }
 event(body:Row){
  if(body.kind==='ui.close')this.observe({active:false,close:true});
  if(this.url&&body.kind==='ui.observation'&&body.data&&typeof body.data==='object'&&!Array.isArray(body.data)){
   this.observe({page:{...body.data,url:this.url},active:body.data.visible===true});return;
  }
  try{
   const event=core('activityEvent',{id:crypto.randomUUID().toUpperCase(),surfaceId:this.surfaceID,at:Date.now()/1000,kind:body.kind??'',data:body.data??{}});
   if(event)this.persist([event]);
  }catch(error){this.store.historyFailure(error,typeof body.kind==='string'?body.kind:'activity');}
 }
 private persist(events:Row[]){
  if(!events.length)return;
  const ledger=this.store.ledger();
  // Core gives each observation a stable id, so a retried batch adds no second row.
  ledger.transaction(()=>{for(const event of events)ledger.append(event,event.surfaceId??'');});
 }
}
