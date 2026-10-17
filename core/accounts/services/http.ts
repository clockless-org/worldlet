// A Worldlet Service read over the service's own HTTPS API with a key the person pasted, where no official MCP server
// fits the World's account pipeline. The Platform runs each request (platform/electron/src/modules/sources/
// service-source.ts); Core decides which requests and what of each answer reaches an Agent.

/** What a reader may ask. `path` is an absolute path on the one address the person gave (it starts with `/`); the
 * Platform sends nothing anywhere else, follows no redirect, and stops a request at the gate's time and size. */
export interface ServiceHttp {
 get(path:string):Promise<unknown>;
 post(path:string,body:unknown):Promise<unknown>;
}

/** A Service's limits and plain messages: `refused` when a pasted key is turned down (401) while connecting,
 * `disconnected` when a kept one is (it expired or was revoked), `forbidden` (403), `missing` (404), `invalid` (400,
 * followed by what the service said, in short), `busy` (429). `publicOnly`: the address is one the person typed (HTTP
 * JSON), so the Platform sends nothing to a name that resolves to a private, loopback or link-local address
 * (privateAddress). */
export interface ServiceGate {
 name:string;title:string;timeoutSeconds:number;maxBytes:number;
 refused:string;disconnected:string;forbidden:string;missing:string;invalid:string;busy:string;connectMessage:string;
 publicOnly?:boolean;
}

/** An IP address no Service is read at: this computer (loopback, unspecified), the local network (private ranges,
 * carrier-grade NAT, IPv6 unique-local), link-local (cloud metadata addresses among them), multicast and reserved
 * ranges, and IPv4 addresses written inside IPv6. Anything that is not an IP address at all is refused too. */
export function privateAddress(address:string):boolean {
 const text=address.trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/%.*$/,'');
 const v4=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
 if(v4){
  const [a,b]=[Number(v4[1]),Number(v4[2])];
  if(v4.slice(1).some(part=>Number(part)>255))return true;
  return a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===198&&(b===18||b===19)||a===192&&b===0&&Number(v4[3])===0;
 }
 if(!text.includes(':')||!/^[0-9a-f:.]+$/.test(text))return true;
 // An IPv4 address inside IPv6 (::ffff:a.b.c.d, ::a.b.c.d, and the hexadecimal forms) is judged as that address.
 const tail=/^(?:::(?:ffff:)?(?:0:)?)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
 if(tail)return privateAddress(tail[1]);
 const hex=/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(text);
 if(hex){const high=parseInt(hex[1],16),low=parseInt(hex[2],16);return privateAddress(`${high>>8}.${high&255}.${low>>8}.${low&255}`);}
 if(text==='::'||text==='::1')return true;
 const first=parseInt(text.split(':')[0]||'0',16);
 // fc00::/7 unique-local, fe80::/10 link-local, fec0::/10 old site-local, ff00::/8 multicast; 64:ff9b::/96 NAT64 and
 // 2002::/16 6to4 can carry an IPv4 address, so they are refused rather than decoded.
 return (first&0xfe00)===0xfc00||(first&0xffc0)===0xfe80||(first&0xffc0)===0xfec0||(first&0xff00)===0xff00||first===0x64||first===0x2002||first===0;
}
