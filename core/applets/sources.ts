/** Account sources an Agent connects and reads directly. */
export const SOURCE_PROVIDERS=['gmail','google-calendar','google-drive','github','notion','linear','paypal','todoist','supabase','posthog','cloudflare','http','search-console'];
/** One Google sign-in grants Mail and Calendar together. */
export const GOOGLE_SIGN_IN=['google','gmail','google-calendar'];
export const GOOGLE_SIGN_IN_SERVICES=['gmail','google-calendar'];
/** A setting a token source also needs, asked for beside the token (PostHog's address and project). */
export interface TokenField {key:string;label:string;hint?:string;value?:string;placeholder?:string;numeric?:boolean;maxLength:number}
/** Sources that connect only with a token the person pastes (GitHub's server offers no sign-in Worldlet can register
 * for; PostHog and Cloudflare take an API key; Search Console a service account's JSON key), each with the one line saying what the token needs, what the token is
 * called there, the settings it also needs, and a token shape that is a common mistake. The token is checked with
 * one read before it is kept. `optional`: the source also connects with no token (an open HTTP JSON endpoint). */
/** `signIn`: the source also connects with no token, through its own sign-in (core/accounts/connectors.ts); its
 * settings may then be partly given (a project chosen after signing in). */
export const TOKEN_PROVIDERS:Readonly<Record<string,{hint:string;token:RegExp;label?:string;optional?:boolean;signIn?:boolean;fields?:readonly TokenField[];wrong?:{token:RegExp;message:string}}>>=Object.freeze({
 // With no token, GitHub signs in with the official Worldlet GitHub App's device code (core/accounts/github-device.ts).
 github:{hint:'Paste a fine-grained token with read-only access to Issues, Pull requests and Metadata.',token:/^[A-Za-z0-9_]{20,255}$/,signIn:true},
 posthog:{hint:'Paste a personal API key with read access to Project, Query, Insight, Dashboard, Feature flag and Annotation.',token:/^[A-Za-z0-9_-]{20,255}$/,label:'personal API key',signIn:true,
  fields:Object.freeze([
   {key:'host',label:'PostHog address',value:'https://us.posthog.com',hint:'US Cloud is https://us.posthog.com and EU Cloud https://eu.posthog.com; a self-hosted PostHog uses its own address.',maxLength:200},
   {key:'project',label:'Project ID',placeholder:'12345',hint:'The number after /project/ in your PostHog address bar.',numeric:true,maxLength:12},
  ]),
  wrong:{token:/^phc_/,message:'That is a project API key, which only sends events. Paste a personal API key (it starts with phx_).'}},
 cloudflare:{hint:'Paste an API token with Account Analytics Read (and Zone Read and Zone Analytics Read to see your zones).',token:/^[A-Za-z0-9_-]{30,255}$/,label:'API token',signIn:true,
  fields:Object.freeze([
   {key:'account',label:'Account ID',placeholder:'32 letters and digits',hint:'The part after dash.cloudflare.com/ in your dashboard\'s address.',maxLength:40},
  ]),
  wrong:{token:/^[0-9a-f]{37}$/,message:'That looks like the Global API Key, which can change everything in your account. Create an API token with read-only analytics access instead.'}},
 // Each connect adds or replaces one named endpoint; the others stay (service-source.ts).
 http:{hint:'Paste a token only if the endpoint needs one: Worldlet sends it as a Bearer header and only to that address.',token:/^[\x21-\x7e]{8,2000}$/,label:'token (optional)',optional:true,
  fields:Object.freeze([
   {key:'name',label:'Name',placeholder:'status',hint:'A short name Agents and presets use: lowercase letters, digits and -.',maxLength:32},
   {key:'url',label:'Base address',placeholder:'https://api.example.com/v1/',hint:'Reads are GET requests to paths under this HTTPS address.',maxLength:300},
  ])},
 // The whole JSON key file; the host checks what is in it (core/accounts/services/search-console.ts). With no key,
 // it signs in with Worldlet's Google sign-in instead.
 'search-console':{hint:'Paste the JSON key of a Google service account that you added as a user of your sites in Search Console.',token:/^\{[\s\S]{50,7998}\}$/,label:'service account key',signIn:true,
  wrong:{token:/^\{\s*"(?:installed|web)"\s*:/,message:'That is an OAuth client file, not a service account key. Create a JSON key for a service account instead.'}},
});
/** The token a `connect` request carries: only for a source that connects with one, required there, and shaped like a
 * token. An error never repeats what was pasted. */
export function connectToken(provider:string,value:unknown):string {
 const rule=Object.hasOwn(TOKEN_PROVIDERS,provider)?TOKEN_PROVIDERS[provider]:null;
 if(!rule){if(value!==undefined&&value!=='')throw Error('This source does not connect with a token.');return '';}
 const token=typeof value==='string'?value.trim():'';
 if(!token&&(rule.optional||rule.signIn)&&(value===undefined||typeof value==='string'))return '';
 if(!token)throw Error(rule.hint);
 if(rule.wrong?.token.test(token))throw Error(rule.wrong.message);
 if(!rule.token.test(token))throw Error('That does not look like a token. '+rule.hint);
 return token;
}
/** The settings a `connect` request carries beside the token: exactly the source's fields, each given and short.
 * Their meaning (an address, a project) is checked by the connection's owner before anything is sent. With no token
 * for a source that signs in (`signIn`), only the fields given are taken (a project chosen after signing in). */
export function connectSettings(provider:string,value:unknown,token=''):Record<string,string> {
 const rule=Object.hasOwn(TOKEN_PROVIDERS,provider)?TOKEN_PROVIDERS[provider]:null,fields=rule?.fields??[];
 const given=value===undefined||value===null?{}:value;
 if(typeof given!=='object'||Array.isArray(given)||Object.keys(given).some(key=>!fields.some(field=>field.key===key)))throw Error('This source does not take these settings.');
 const partial=!token&&rule?.signIn===true;
 return Object.fromEntries(fields.filter(field=>!partial||Object.hasOwn(given,field.key)).map(field=>{
  const entry=(given as Record<string,unknown>)[field.key],text=typeof entry==='string'?entry.trim():'';
  if(!text)throw Error(`Enter the ${field.label}.`);
  if(text.length>field.maxLength)throw Error(`The ${field.label} is too long.`);
  return [field.key,text];
 }));
}
