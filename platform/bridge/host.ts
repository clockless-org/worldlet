import {isPresentationAction} from '../../contracts/presentation.ts';
import {readPresentationRequest} from '../../context/context/index.ts';
import {isItemHostAction,readItemHostRequest} from '../../contracts/item-actions.ts';
import {readBrowserOutcomeRequest} from '../../contracts/browser-receipt.ts';
import {isBrowserSurfaceAction,readBrowserSurfaceRequest} from '../../contracts/browser-surface.ts';
import {isFoxHostAction} from '../../contracts/fox.ts';
import {readFoxHostRequest} from '../../agent/companion/index.ts';
import {changesModelStatus} from '../../agent/companion/index.ts';
import type {HostCall,HostRequest,HostTransport} from '../../contracts/platform.ts';
import {webHost} from './web-host.ts';
import {roomHost} from './room-host.ts';
// The only trusted-page transport selection point. Browser-page observers are
// separately injected scripts and must never receive this application bridge.
export function resolveHost(scope:any):HostTransport|undefined {
 const host=scope.worldletHost;
 if(host){
  if(host.version!==1||!['macos','windows','linux'].includes(host.platform)||typeof host.request!=='function')throw Error('Unsupported Worldlet host protocol. Update the app.');
  return host;
 }
 const legacy=scope.webkit?.messageHandlers?.worldlet;
 if(legacy)return {version:1,platform:'macos',request:(request:HostRequest)=>legacy.postMessage(request)};
 // The World page in a web browser on this computer, served by the host with its socket (web-host.ts), or on another
 // device, joining the computer in the pairing room from a `world` link (room-host.ts).
 return webHost(scope)??roomHost(scope);
}
export const callHost:HostCall=async(action:string,body:object={})=> {
 const host=resolveHost(window);
 if(!host)throw Error('Please open this in the Worldlet app.');
 const invalidate=()=>window.dispatchEvent(new Event('worldlet:model-invalidated'));
 const changes=changesModelStatus(action,{...body});
 if(changes)invalidate();
 let request={...body,action};
 if(isPresentationAction(action))request=readPresentationRequest(request);
 if(isItemHostAction(action))request=readItemHostRequest(request);
 if(action==='browserOutcomeAction')request=readBrowserOutcomeRequest(request);
 if(isFoxHostAction(action))request=readFoxHostRequest(request);
 if(isBrowserSurfaceAction(action))readBrowserSurfaceRequest(request);
 try{return await host.request(request);}
 finally{if(changes)invalidate();}
}

/** Observe semantic World commands without changing sync/async return behavior. */
export function recordWorldCommand<T>(name:string,args:Record<string,unknown>,run:()=>T):T {
 const commandId=crypto.randomUUID();
 const record=(status:string)=>{void callHost('worldActivity',{kind:'ui.command',data:{operation:name,status,commandId,target:typeof args?.id==='string'?args.id:''}}).catch(()=>{});void callHost('uiCommand',{operation:name,status,commandId,...(typeof args?.id==='string'?{id:args.id}:{})}).catch(()=>{});};
 record('requested');
 try {
  const result=run();
  if(result&&typeof (result as any).then==='function')void Promise.resolve(result).then(value=>record((value as any)?.error?'failed':'succeeded'),()=>record('failed'));
  else record((result as any)?.error?'failed':'succeeded');
  return result;
 } catch(error){record('failed');throw error;}
}
