import type {World} from '../../contracts/world.ts';
declare const __WORLDLET_PROJECTION_WORKER__:string;

/** One in-flight request; snapshotInbox owns coalescing and ordering above this.
 * Errors are visible, never a silent expensive main-thread fallback. */
export function createWorldProjector(){
 let worker:Worker|undefined,id=0,pending:{id:number,resolve:(world:World)=>void,reject:(error:Error)=>void,timer:ReturnType<typeof setTimeout>}|undefined;
 function fail(message:string){const active=pending;pending=undefined;if(active){clearTimeout(active.timer);active.reject(Error(message));}worker?.terminate();worker=undefined;}
 function start(){
  const url=URL.createObjectURL(new Blob([__WORLDLET_PROJECTION_WORKER__],{type:'text/javascript'}));
  try{worker=new Worker(url,{name:'world-projection'});}finally{URL.revokeObjectURL(url);}
  worker.onmessage=({data})=>{if(!pending||data.id!==pending.id)return;const active=pending;pending=undefined;clearTimeout(active.timer);if(data.error)active.reject(Error(data.error));else active.resolve(data.world);};
  worker.onerror=event=>{event.preventDefault();fail('World data worker failed. Try refreshing the world.');};
  worker.onmessageerror=()=>fail('Could not receive world data.');
 }
 return {
  project(state):Promise<World>{
   if(pending)return Promise.reject(Error('World projection is already running.'));
   return new Promise((resolve,reject)=>{
    try{
     if(!worker)start();const request=++id;
     pending={id:request,resolve,reject,timer:setTimeout(()=>fail('World data preparation timed out.'),30000)};
     // Only fields used by the projection cross this boundary, never grants,
     // model configuration, conversation history or the editable local overlay.
     worker.postMessage({id:request,state:{workspaceId:state.workspaceId,revision:state.revision,sources:state.sources,knowledge:state.knowledge,onboarding:state.onboarding,ongoing:state.ongoing,layout:state.layout,connections:state.connections,worldItems:state.worldItems,momentApplets:state.momentApplets,siteApplets:state.siteApplets,appletArt:state.appletArt,taskReviews:state.taskReviews}});
    }catch{fail('Could not start world data preparation.');reject(Error('Could not start world data preparation.'));}
   });
  },
  dispose(){fail('World data preparation cancelled.');}
 };
}
