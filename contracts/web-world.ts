// The World in a web browser (docs/UI-CORE-PLATFORM.md#the-world-in-a-web-browser): the same World page the app shows,
// served by the host on 127.0.0.1 at /world/ and talking to it over one WebSocket at /world/socket instead of the
// app's IPC. Both sides use this file: the page's transport (platform/bridge/web-host.ts) and the host's
// (platform/electron/src/host/web-page.ts, platform/electron/src/modules/phone/local-relay.ts).

/** Where the host serves the World page and its socket. */
export const WORLD_WEB_PATH='/world/';
export const WORLD_SOCKET_PATH='/world/socket';
/** The WebSocket subprotocol the page asks for and the host answers with. The token goes in a second subprotocol
 * (`worldTokenProtocol`), which the host reads and never echoes back. */
export const WORLD_PROTOCOL='worldlet-world.v1';
const TOKEN_PREFIX='worldlet-token.';
/** 32 random bytes, base64url without padding. */
export const WORLD_TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const worldTokenProtocol=(token:string)=>TOKEN_PREFIX+token;
/** The token among the subprotocols a page offered (`Sec-WebSocket-Protocol`), or '' when none is well formed. */
export function worldTokenFrom(protocols:string):string {
 for(const value of protocols.split(',').map(part=>part.trim()))if(value.startsWith(TOKEN_PREFIX)&&WORLD_TOKEN.test(value.slice(TOKEN_PREFIX.length)))return value.slice(TOKEN_PREFIX.length);
 return '';
}
/** The World's link on this computer: the token rides in the fragment, which a browser never sends to a server. */
export const worldLink=(origin:string,token:string)=>`${origin}${WORLD_WEB_PATH}#t=${token}`;
/** The token in a link's fragment (`#t=…`), or ''. */
export function worldLinkToken(hash:string):string {
 const value=new URLSearchParams(hash.replace(/^#/,'')).get('t')||'';
 return WORLD_TOKEN.test(value)?value:'';
}

/** Frames on the socket, all JSON text.
 * Host → page: `h` the handshake, `a` the answer to a request, `c` a call of a page global, `v` an event (`doc`: on
 * document), `x` the page was closed by the host (`elsewhere`: a newer page took over).
 * Page → host: `q` a request (the body `worldletHost.request` takes), `r` the value a call returned. */
export type WorldHostFrame=
 {h:{version:1;platform:'macos'|'windows'|'linux'}}|
 {a:number;ok:true;value?:unknown}|{a:number;ok:false;error:string}|
 {c:number;name:string;args:unknown[]}|
 {v:string;detail?:unknown;doc?:true}|
 {x:'elsewhere'};
export type WorldPageFrame={q:number;body:Record<string,unknown>}|{r:number;value?:unknown};
/** The close code a page that was taken over receives. */
export const WORLD_ELSEWHERE_CODE=4001;

/** What a World page in a browser may not ask for, though the app's own World page may: reading the vault and the
 * pairing secrets, pairing or unpairing another device, deleting local data, restoring or replacing the library, and
 * the local tools that read other programs' files on this computer. `true` denies the action; a list denies only those
 * operations. The host checks this before the request reaches the router. */
export const WEB_DENIED:Readonly<Record<string,true|readonly string[]>>=Object.freeze({
 // Pairing: the status is read, without its link (webReply).
 phonePair:Object.freeze(['start','end','open','background']),
 // Local data deletion, restore and the whole-library backup.
 dataBackup:true,
 deleteSourceData:true,
 clearWorldContent:true,
 // Local tools: other programs' sessions and stores on this computer.
 codexSession:true,
 codexTask:true,
 codexCancel:true,
 claudeSession:true,
 developmentSessions:true,
 voiceMemos:true,
 messages:true,
});
export const WEB_DENIED_MESSAGE='This needs the Worldlet app on this computer.';
/** Why a browser's World page may not make this request, or '' when it may. */
export function webDenied(body:unknown):string {
 if(!body||typeof body!=='object')return '';
 const {action,operation}=body as {action?:unknown;operation?:unknown};
 if(typeof action!=='string'||!Object.hasOwn(WEB_DENIED,action))return '';
 const rule=WEB_DENIED[action];
 if(rule===true)return WEB_DENIED_MESSAGE;
 return typeof operation==='string'&&rule.includes(operation)?WEB_DENIED_MESSAGE:'';
}
/** A reply as a browser's World page gets it: a pairing's link (its secret) stays on the host. */
export function webReply(body:Record<string,unknown>,value:unknown):unknown {
 if(body.action==='phonePair'&&value&&typeof value==='object'&&!Array.isArray(value)&&'link' in value){
  const {link:_link,...rest}=value as Record<string,unknown>;
  return rest;
 }
 return value;
}
