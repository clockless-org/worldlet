/** Account sources an Agent connects and reads directly. */
export const SOURCE_PROVIDERS=['gmail','google-calendar','google-drive','github','notion','linear','paypal','todoist','supabase'];
/** One Google sign-in grants Mail and Calendar together. */
export const GOOGLE_SIGN_IN=['google','gmail','google-calendar'];
export const GOOGLE_SIGN_IN_SERVICES=['gmail','google-calendar'];
/** Sources that connect only with a token the person pastes (GitHub's server offers no sign-in Worldlet can register
 * for), each with the one line saying what the token needs. The token is checked with one read before it is kept. */
export const TOKEN_PROVIDERS:Readonly<Record<string,{hint:string;token:RegExp}>>=Object.freeze({
 github:{hint:'Paste a fine-grained token with read-only access to Issues, Pull requests and Metadata.',token:/^[A-Za-z0-9_]{20,255}$/},
});
/** The token a `connect` request carries: only for a source that connects with one, required there, and shaped like a
 * token. An error never repeats what was pasted. */
export function connectToken(provider:string,value:unknown):string {
 const rule=Object.hasOwn(TOKEN_PROVIDERS,provider)?TOKEN_PROVIDERS[provider]:null;
 if(!rule){if(value!==undefined&&value!=='')throw Error('This source does not connect with a token.');return '';}
 const token=typeof value==='string'?value.trim():'';
 if(!token)throw Error(rule.hint);
 if(!rule.token.test(token))throw Error('That does not look like a token. '+rule.hint);
 return token;
}
