import {mailRemoteHostAllowed} from '../applets/index.ts';
// An email's own picture may replace the illustration on its Attention card (owner Order 2026-10-08).
// The reader keeps one candidate per thread (`contentImage`, core/accounts/google/gmail.ts); this is the
// address rule every later step repeats: HTTPS on the default port to a public host, no credentials, and no
// address that names itself a pixel, beacon, logo or icon. The host reads it without cookies or referrer, only
// when the card opens, and the card uses it only when it is large enough to be a picture (`attentionPictureFits`).
const NOT_CONTENT=/(?:^|[\W_])(?:logos?|icons?|avatars?|badges?|spacer|pixel|beacon|track(?:ing)?|open|blank|transparent)(?:$|[\W_\d])/i;
export function attentionImageURL(value:unknown):string {
 if(typeof value!=='string'||value.length>2000)return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!mailRemoteHostAllowed(url.hostname))return '';
  if(NOT_CONTENT.test(url.hostname)||NOT_CONTENT.test(url.pathname.split('/').at(-1)||''))return '';
  return url.href;
 }catch{return '';}
}
/** A picture worth a card's background: at least 320×160 and no stranger than a 4:1 banner or a 2:3 portrait. */
export function attentionPictureFits(width:number,height:number):boolean {
 return width>=320&&height>=160&&width/height<=4&&width/height>=2/3;
}
/** The first verified source picture of an Attention item, if its sources carried one. */
export function attentionSourceImage(sources:unknown):string {
 for(const ref of Array.isArray(sources)?sources:[]){const url=attentionImageURL(ref?.image);if(url)return url;}
 return '';
}
