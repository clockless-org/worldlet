// Hermes sign-in handoffs: what a Harness may make the host open or display. One rule for both hosts.
// Kept ES-compatible for JavaScriptCore and Jint; no URL global. The raw string is matched, never normalized.
export const MODEL_DEVICE_URL='https://auth.openai.com/codex/device';
const GOOGLE_AUTH=/^https:\/\/accounts\.google\.com(?::443)?\/o\/oauth2\/(?:v2\/)?auth(?:\?[\x21\x22\x24-\x7e]*)?$/;
/** Google's own consent page, or undefined: the only address a sign-in may open or offer to copy. */
export const googleAuthorizationUrl=(value:unknown):string|undefined=>typeof value==='string'&&value.length<=8192&&GOOGLE_AUTH.test(value)?value:undefined;
export type AuthHandoff={type:'google_auth';url:string}|{type:'authorization';code:string;url:string};
/** Accepts one handoff per run (`sent` is the host's per-run flag) and only for the matching request. */
export function harnessAuthHandoff(input:{event:unknown;action?:unknown;operation?:unknown;sent?:unknown}):AuthHandoff {
 const event=input.event&&typeof input.event==='object'&&!Array.isArray(input.event)?input.event as Record<string,unknown>:{};
 const text=(key:string)=>{const value=event[key];if(typeof value!=='string')throw Error('Missing Agent event field: '+key);return value;};
 if(event.type==='google_auth'){
  const url=text('url');
  if(input.sent!==false||input.action!=='google'||input.operation!=='connect'||!googleAuthorizationUrl(url))throw Error('Unexpected Google authorization event.');
  return {type:'google_auth',url};
 }
 if(event.type==='model_auth'){
  if(input.sent!==false||input.action!=='modelLogin'||text('url')!==MODEL_DEVICE_URL)throw Error('Unexpected model authorization event.');
  const code=text('code');
  if(!(/^[A-Za-z0-9-]{1,64}$/).test(code))throw Error('Invalid model authorization code.');
  return {type:'authorization',code,url:MODEL_DEVICE_URL};
 }
 throw Error('Unexpected authorization event.');
}
