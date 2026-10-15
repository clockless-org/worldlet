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
 * followed by what the service said, in short), `busy` (429). */
export interface ServiceGate {
 name:string;title:string;timeoutSeconds:number;maxBytes:number;
 refused:string;disconnected:string;forbidden:string;missing:string;invalid:string;busy:string;connectMessage:string;
}
