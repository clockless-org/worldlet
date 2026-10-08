import {attentionImageURL} from '../../../../../core/attention/index.ts';
import {readImage} from './mail-avatar.ts';
import type {Row} from '../../host/types.ts';
// An email's own picture for its Attention card (core/attention/source-image.ts). Read only when the card
// opens, with no cookies or referrer, and returned as a data: image (the World page loads no remote image).
// Results stay in memory for this app session, like sender portraits; the practice world never reads one.
const LIMIT=2_500_000,MAX_ENTRIES=60;
const pictures=new Map<string,string>(),pending=new Map<string,Promise<string>>();

export async function attentionImage(request:Row,sample:boolean):Promise<Row> {
 const url=sample?'':attentionImageURL(request.url);
 if(!url)return {image:''};
 const known=pictures.get(url);
 if(known!==undefined)return {image:known};
 let read=pending.get(url);
 if(!read){
  read=readImage(url,LIMIT,0,attentionImageURL).then(image=>{
   // A raster picture only: an SVG from a sender is a logo or a drawing, not a photograph.
   const value=/^data:image\/(?:png|jpeg|webp|gif);/.test(image)?image:'';
   pictures.delete(url);pictures.set(url,value);
   while(pictures.size>MAX_ENTRIES)pictures.delete(pictures.keys().next().value!);
   return value;
  }).finally(()=>pending.delete(url));
  pending.set(url,read);
 }
 return {image:await read};
}
export function clearAttentionImages(){pictures.clear();}
