// The `voice` Harness service's rules (contracts/harness-services.ts HarnessVoice): Fox's spoken reply read by the
// person's own Agent's text-to-speech, with the provider, voice and persona they set up there. OpenClaw synthesizes one
// clip with `openclaw infer tts convert --text … --output <file> --json` (docs.openclaw.ai/cli/infer#tts; local by
// default, no Gateway needed), answering `{ok,provider,outputs:[{path,format}]}`. Hermes Agent's speech is an Agent tool
// (`text_to_speech`) and its dashboard's `/api/audio/speak`, not a command, so it declares no `voice`. The host runs the
// command and plays the clip; these are the rules. Kept ES-compatible for JavaScriptCore and Jint.

export const HARNESS_VOICE=Object.freeze({
 /** OpenClaw's `tts.maxTextLength` default; a longer reply is read by a system voice. */
 characters:4096,
 /** How long one clip may take to synthesize before the system voice reads the reply instead. */
 timeoutMs:20_000,
 /** The largest clip played (about ten minutes of speech at 128 kbps). */
 bytes:10*1024*1024,
});
const MIME:Record<string,string>={mp3:'audio/mpeg',mpeg:'audio/mpeg',ogg:'audio/ogg',opus:'audio/ogg',wav:'audio/wav',flac:'audio/flac',m4a:'audio/mp4',aac:'audio/aac',webm:'audio/webm'};

/** The text the Agent is asked to speak, or null when the system voice should read it (empty, too long). */
export function harnessVoiceText(value:unknown):string|null {
 const text=typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
 return text&&[...text].length<=HARNESS_VOICE.characters?text:null;
}
/** `openclaw infer tts convert` for one clip. Values are given as `--name=value`, so a leading dash stays text. */
export function openClawVoiceArgs(text:string,output:string):string[] {
 return ['infer','tts','convert','--text='+text,'--output='+output,'--json'];
}
/** The command that synthesizes one clip with `id`'s own text-to-speech, or null when that Harness has none. */
export function harnessVoiceArgs(id:string,text:string,output:string):string[]|null {
 return id==='openclaw'?openClawVoiceArgs(text,output):null;
}
/** The clip's file and type from the command's answer, or why there is none. */
export function harnessVoiceResult(code:number|null,stdout:string,stderr:string):{path:string;mimeType:string;provider?:string}|{error:string} {
 let value:Record<string,any>|null=null;
 // The answer is the JSON object that ends its output; anything a plugin logged before it is skipped.
 const start=stdout.search(/^\{/m);
 try{const parsed=JSON.parse(start>=0?stdout.slice(start):stdout);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))value=parsed;}catch{}
 const output=Array.isArray(value?.outputs)?value!.outputs.find((item:unknown)=>item&&typeof (item as {path?:unknown}).path==='string'):null;
 if(code!==0||value?.ok!==true||!output){
  const said=String(value?.error?.message??value?.error??stderr??'').trim().split('\n').pop()?.slice(0,200);
  return {error:said||'Your Agent could not speak this reply.'};
 }
 const extension=String(output.format||output.path.split('.').pop()||'').toLowerCase();
 const provider=typeof value!.provider==='string'&&value!.provider.length<=60?value!.provider:'';
 return {path:output.path,mimeType:MIME[extension]??'audio/mpeg',...provider?{provider}:{}};
}
