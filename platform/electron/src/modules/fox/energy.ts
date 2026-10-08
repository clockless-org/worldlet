import type {Row} from '../../host/types.ts';
import type {AgentService} from '../../host/services.ts';

// The world's energy (owner decisions 2026-10-02): model tokens are shown as the power that runs the
// whole world, Fox and every Applet, never as tokens, model names or money. Worldlet provides no energy of its
// own (owner decision 2026-10-05): it comes from the person's computer. `chatgpt`: a ChatGPT plan (the Codex
// sign-in on this computer). `own`: the person's own provider or API key, or a local Agent answering itself.
// `none`: nothing on this computer charges the world yet.
export type EnergySource='chatgpt'|'own'|'none';
export interface FoxEnergy {
 source:EnergySource;ready:boolean;name:string;provider:string;
 /** Percent left, or null when only the provider knows (API keys, ChatGPT plans). */
 level:number|null;resetsAt:string|null;
 /** The ChatGPT plan is this computer's Codex sign-in, whose usage the Codex app server reports. */
 localCodex:boolean;
}

export async function readFoxEnergy(runtime:AgentService,record:(error:unknown)=>void):Promise<FoxEnergy> {
 let status:Row;
 const none:FoxEnergy={source:'none',ready:false,name:'',provider:'',level:null,resetsAt:null,localCodex:false};
 // While a fresh install or an update prepares Fox's runtime there is nothing to read yet, and a read would only
 // start a process that cannot launch: that is setup, not a failure (PostHog 01a0ffbb, HermesWorker.launch).
 if(!runtime.available)return none;
 try{status=await runtime.status(runtime.home('private'));}
 catch(error){record(error);return none;}
 const text=(value:unknown)=>typeof value==='string'?value:'';
 const provider=text(status.provider),ready=status.ready===true,localCodex=status.source==='local-codex';
 // The Codex sign-in is the fallback for every world, so a missing one means nothing charges it.
 const source:EnergySource=provider==='openai-codex'?(ready?'chatgpt':'none'):status.configured===true||ready&&!!provider?'own':'none';
 return {source,ready,name:text(status.name),provider,level:null,resetsAt:null,localCodex};
}
