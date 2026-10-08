import {invoke} from '../../../core/index.ts';
// The shared rules run in-process. The host still exchanges JSON with them, exactly as the
// earlier JavaScriptCore/Jint hosts did, so no native caller can hand Core a live object.
export class CoreError extends Error {}
export function core<T=any>(operation:string,input:unknown):T {
 const envelope=JSON.parse(invoke(operation,JSON.stringify(input??{})));
 if(envelope.ok!==true)throw new CoreError(envelope.error||'Shared business rule failed.');
 return envelope.value as T;
}
export function coreEnvelope(operation:string,input:unknown){return JSON.parse(invoke(operation,JSON.stringify(input??{})));}
