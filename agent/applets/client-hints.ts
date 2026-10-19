/**
 * How a website panel identifies its engine (#1089). Google refuses sign-in in browsers it
 * judges embedded and requires them to identify truthfully; it does not publish its signals.
 * On Electron 44.5.1 (Chromium 152) a website session sends no User-Agent Client Hint headers at
 * all (`Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`), with or without a user-agent
 * override and even after an `Accept-CH` opt-in, although its pages read the same brands from
 * `navigator.userAgentData`. Its user agent names Electron, the app and the full Chromium version.
 * A Chromium browser sends those three headers on every secure request and a reduced user agent
 * (`Chrome/<major>.0.0.0`, no embedder tokens).
 *
 * These rules rebuild both from the engine's own facts so the request headers, the user agent and
 * the page's JavaScript agree. Nothing claims Google Chrome: the brands are Chromium's own list
 * without an embedder brand, the one the engine reports to pages. High-entropy hints
 * (full version list, platform version, architecture, model) are not sent as headers; pages still
 * read them through `navigator.userAgentData.getHighEntropyValues`.
 */

export interface UserAgentBrand {brand:string;version:string}
export interface EngineFacts {chromium:string;os:string}

const GREASE_CHARS=[' ','(',':','-','.','/',')',';','=','?','_'],GREASE_VERSIONS=['8','99','24'];
const PLATFORMS:Record<string,string>={darwin:'macOS',win32:'Windows',linux:'Linux'};

const major=(version:string)=>{const value=Number.parseInt(String(version).split('.')[0],10);return Number.isFinite(value)&&value>0?value:0;};

/** Chromium's brand list without an embedder brand (embedder_support GenerateBrandVersionList), seeded by the major version. */
export function chromiumBrands(chromium:string):UserAgentBrand[] {
 const seed=major(chromium);if(!seed)return [];
 const grease={brand:`Not${GREASE_CHARS[seed%GREASE_CHARS.length]}A${GREASE_CHARS[(seed+1)%GREASE_CHARS.length]}Brand`,version:GREASE_VERSIONS[seed%GREASE_VERSIONS.length]};
 const list:UserAgentBrand[]=[];
 list[seed%2]=grease;list[(seed+1)%2]={brand:'Chromium',version:String(seed)};
 return list;
}

/** `navigator.userAgentData.platform` for a Node `process.platform`. */
export function hintPlatform(os:string):string {return PLATFORMS[os]??'Unknown';}

/** The engine's user agent as Chromium presents it: no Electron or app token, Chrome/<major>.0.0.0. */
export function chromiumUserAgent(userAgent:string):string {
 return String(userAgent).replace(/\s(?:Electron|worldlet|Worldlet[^/\s]*)\/\S+/g,'').replace(/\bChrome\/(\d+)\.\d+\.\d+\.\d+\b/,'Chrome/$1.0.0.0');
}

/** Chromium sends UA client hints only to potentially trustworthy origins: HTTPS and loopback HTTP. */
export function sendsClientHints(raw:unknown):boolean {
 let url:URL;try{url=raw instanceof URL?raw:new URL(String(raw));}catch{return false;}
 if(url.protocol==='https:'||url.protocol==='wss:')return true;
 return (url.protocol==='http:'||url.protocol==='ws:')&&['localhost','127.0.0.1','[::1]'].includes(url.hostname.toLowerCase());
}

const quoted=(value:string)=>'"'+value.replace(/[\\"]/g,'\\$&')+'"';

/** The default (low-entropy) UA client hint headers a Chromium browser sends, lower-cased. */
export function clientHintHeaders(engine:EngineFacts):Record<string,string> {
 const brands=chromiumBrands(engine.chromium);if(!brands.length)return {};
 return {
  'sec-ch-ua':brands.map(item=>`${quoted(item.brand)};v=${quoted(item.version)}`).join(', '),
  'sec-ch-ua-mobile':'?0',
  'sec-ch-ua-platform':quoted(hintPlatform(engine.os)),
 };
}

/** Request headers with the engine's default hints added where the request lacks them; null when nothing changes. */
export function withClientHints(url:unknown,headers:Record<string,string>,engine:EngineFacts):Record<string,string>|null {
 if(!sendsClientHints(url))return null;
 const present=new Set(Object.keys(headers).map(name=>name.toLowerCase()));
 const missing=Object.entries(clientHintHeaders(engine)).filter(([name])=>!present.has(name));
 return missing.length?{...headers,...Object.fromEntries(missing)}:null;
}
