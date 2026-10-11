import type {Row} from '../../host/types.ts';
import type {AgentService} from '../../host/services.ts';

// What answers for Fox on this computer. Worldlet provides no model of its own (owner decision 2026-10-05) and shows no
// energy, charge or battery (owner request 2026-10-10). `chatgpt`: a ChatGPT plan (the Codex sign-in on this computer).
// `own`: the person's own provider or API key, or a local Agent answering itself. `none`: nothing answers yet.
export type ModelSource='chatgpt'|'own'|'none';
export interface ModelSourceState {source:ModelSource;ready:boolean;name:string;provider:string}

export async function readModelSource(runtime:AgentService,record:(error:unknown)=>void):Promise<ModelSourceState> {
 let status:Row;
 const none:ModelSourceState={source:'none',ready:false,name:'',provider:''};
 // While a fresh install or an update prepares Fox's runtime there is nothing to read yet, and a read would only
 // start a process that cannot launch: that is setup, not a failure (PostHog 01a0ffbb, HermesWorker.launch).
 if(!runtime.available)return none;
 try{status=await runtime.status(runtime.home('private'));}
 catch(error){record(error);return none;}
 const text=(value:unknown)=>typeof value==='string'?value:'';
 const provider=text(status.provider),ready=status.ready===true;
 // The Codex sign-in is the fallback for every world, so a missing one means nothing answers.
 const source:ModelSource=provider==='openai-codex'?(ready?'chatgpt':'none'):status.configured===true||ready&&!!provider?'own':'none';
 return {source,ready,name:text(status.name),provider};
}
