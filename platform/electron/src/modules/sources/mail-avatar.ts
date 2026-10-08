import {promises as dns} from 'node:dns';
import {bimiLogoURL,gravatarURL,mailAvatarPlan,mailIconURL,mailLogoURL} from '../../../../../core/applets/index.ts';
import {digest} from '../../files.ts';
import type {Row} from '../../host/types.ts';
// Sender portraits for Mail. Core decides which public sources may picture a sender; this
// reads them with fixed URLs and returns a data: image (the World page loads no remote image).
// Results stay in memory for this app session, like live mail content.
const LIMIT=96_000,TIMEOUT=6_000,MAX_ENTRIES=600,MISS_TTL=6*3600_000;
const TYPES:Record<string,string>={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg+xml'};
type Entry={image:string;at:number};
const addresses=new Map<string,Entry>(),domains=new Map<string,Entry>(),pending=new Map<string,Promise<string>>();

/** `senderChosen`: a URL from the sender's DNS (BIMI) or mail, so each redirect is followed only to a URL Core
 * still allows (no IP literal, localhost or local-network name); a function names that rule, `true` means a logo. */
export async function readImage(url:string,limit=LIMIT,minimumSide=0,senderChosen:boolean|((url:string)=>string)=false):Promise<string> {
 let response:Response;
 try{
  const signal=AbortSignal.timeout(TIMEOUT);
  for(let hops=0;;hops++){
   response=await fetch(url,{redirect:senderChosen?'manual':'follow',cache:'no-store',credentials:'omit',signal});
   if(!senderChosen||response.status<300||response.status>=400)break;
   void response.body?.cancel().catch(()=>{});
   const allowed=typeof senderChosen==='function'?senderChosen:mailLogoURL;
   const next=hops<3?allowed(new URL(response.headers.get('location')??'',url).href):'';
   if(!next)return '';
   url=next;
  }
 }catch{return '';}
 const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
 if(response.status!==200||!response.url.startsWith('https://')||!TYPES[type]||!response.body){void response.body?.cancel().catch(()=>{});return '';}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>limit){void reader.cancel().catch(()=>{});return '';}
   parts.push(value);
  }
 }catch{return '';}
 const data=Buffer.concat(parts);
 if(!data.length)return '';
 // A 16-pixel favicon blown up to a portrait reads as noise; initials are clearer.
 if(minimumSide&&type==='image/png'&&data.length>24&&data.toString('ascii',12,16)==='IHDR'&&Math.min(data.readUInt32BE(16),data.readUInt32BE(20))<minimumSide)return '';
 if(type==='image/svg+xml'&&!/<svg[\s>]/i.test(data.toString('utf8',0,Math.min(data.length,4096))))return '';
 return `data:image/${TYPES[type]};base64,${data.toString('base64')}`;
}

async function bimiLogo(domain:string):Promise<string> {
 let records:string[][];
 try{records=await Promise.race([dns.resolveTxt('default._bimi.'+domain),new Promise<string[][]>((_,reject)=>setTimeout(()=>reject(Error('timeout')),TIMEOUT))]);}catch{return '';}
 for(const record of records){const url=bimiLogoURL(record.join(''));if(url)return readImage(url,32_768,0,true);}
 return '';
}

function remember(map:Map<string,Entry>,key:string,image:string){
 map.delete(key);map.set(key,{image,at:Date.now()});
 while(map.size>MAX_ENTRIES)map.delete(map.keys().next().value!);
 return image;
}
function recalled(map:Map<string,Entry>,key:string){
 const entry=map.get(key);
 return entry&&(entry.image||Date.now()-entry.at<MISS_TTL)?entry.image:undefined;
}
const result=(value:string)=>{const index=value.indexOf(':');return index>0?{image:value.slice(index+1),kind:value.slice(0,index)}:{image:''};};
async function organizationImage(bimi:string[],icon:string):Promise<string> {
 const key=bimi.join(',')+'|'+icon,known=recalled(domains,key);
 if(known!==undefined)return known;
 let image='';
 for(const domain of bimi)if((image=await bimiLogo(domain)))break;
 if(!image&&icon)image=await readImage(mailIconURL(icon),LIMIT,32);
 return remember(domains,key,image);
}

/** `{image,kind}`: a data: URL and photo|logo, or an empty image when the Applet shows initials. */
export async function mailAvatar(request:Row,sample:boolean):Promise<Row> {
 const plan=sample||typeof request.address!=='string'||request.address.length>320?null:mailAvatarPlan(request.address);
 if(!plan)return {image:''};
 const known=recalled(addresses,plan.address);
 if(known!==undefined)return result(known);
 let read=pending.get(plan.address);
 if(!read){
  read=(async()=>{
   const photo=plan.gravatar?await readImage(gravatarURL(digest(plan.address))):'';
   // A leading marker keeps the kind with the cached image: a photo fills the stamp, a logo sits on paper.
   const image=photo?'photo:'+photo:plan.bimi.length||plan.icon?await organizationImage(plan.bimi,plan.icon).then(logo=>logo&&'logo:'+logo):'';
   return remember(addresses,plan.address,image);
  })().finally(()=>pending.delete(plan.address));
  pending.set(plan.address,read);
 }
 return result(await read);
}
export function clearMailAvatars(){addresses.clear();domains.clear();}
