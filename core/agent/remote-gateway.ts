// Fox on a remote OpenClaw Gateway, reached directly (core/phone/README.md#an-agent-gateway-on-another-computer):
// the person types its address and token in Settings › Your Agent, and Fox's conversation goes to that Gateway's
// `/v1/responses` (the same path a local OpenClaw uses) with no Worldlet running there. Shared rules only: which
// addresses are accepted, the WebSocket address its approvals use, and the token's shape. The host keeps the token in
// its vault (safeStorage) and runs the turns (platform/electron/src/modules/agent-runtime/remote-gateway.ts).

/** The Harness id of a directly reached remote Gateway (its row in harness-services.ts). */
export const REMOTE_GATEWAY_HARNESS_ID='remote-openclaw';
/** A Gateway address: `base` has no trailing slash (an origin, or an origin plus a path behind a proxy), `host` names it. */
export type RemoteGatewayAddress={base:string;host:string;secure:boolean};
const LOOPBACK=/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;
/** Tailscale's own addresses (100.64.0.0/10) and MagicDNS names: WireGuard already encrypts the way there. */
function tailscale(host:string){
 if(/\.ts\.net$/i.test(host))return true;
 const v4=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
 return !!v4&&v4.slice(1).every(n=>Number(n)<256)&&Number(v4[1])===100&&Number(v4[2])>=64&&Number(v4[2])<=127;
}
/** Reads the address the person typed. HTTPS is required, except on this computer (loopback) and over Tailscale,
 * whose traffic is already encrypted; a pasted `/v1` or `/v1/responses` is dropped; credentials, a query or a fragment
 * in it are refused (the token goes in its own field, never in the address). */
export function readRemoteGatewayUrl(text:unknown):RemoteGatewayAddress {
 const raw=typeof text==='string'?text.trim():'';
 if(!raw||raw.length>500)throw Error('Type your Gateway’s address, like https://gateway.example.com.');
 let url:URL;
 try{url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:'https://'+raw);}catch{throw Error('That is not a Gateway address. Type it like https://gateway.example.com.');}
 if(url.protocol!=='https:'&&url.protocol!=='http:')throw Error('A Gateway address starts with https://.');
 if(url.username||url.password)throw Error('Put the token in its own field, not in the address.');
 if(url.search||url.hash)throw Error('A Gateway address has no ? or # part.');
 const host=url.hostname.toLowerCase();
 if(!host)throw Error('That address names no computer.');
 const secure=url.protocol==='https:';
 if(!secure&&!LOOPBACK.test(host)&&!tailscale(host))throw Error('Fox reaches a Gateway on another computer only over HTTPS, or over Tailscale (a 100.x address or a .ts.net name). Use https://, or connect both computers to Tailscale.');
 const path=url.pathname.replace(/\/+$/,'').replace(/\/v1(?:\/responses)?$/i,'');
 return {base:url.origin+path,host:host.replace(/^\[|\]$/g,''),secure};
}
/** The Gateway's WebSocket (its exec approvals) at the same address: wss for https, ws otherwise. */
export const remoteGatewaySocketUrl=(base:string)=>base.replace(/^http/i,'ws');
/** The Gateway's token or password as typed: one line of printable characters. */
export function readRemoteGatewayToken(text:unknown):string {
 const token=typeof text==='string'?text.trim():'';
 if(!token)throw Error('Type the Gateway’s token (gateway.auth.token in its openclaw.json).');
 if(token.length>4096||!/^[\x21-\x7e]+$/.test(token))throw Error('That token has spaces or characters a Gateway token does not.');
 return token;
}
