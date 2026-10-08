const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
export const characters=(text:string)=>Array.from(segmenter.segment(text),part=>part.segment);
// Index loop: Jint allocates a string per code point in for-of, and archives reach 16 MB.
export function utf8Length(text:string){let length=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);
 if(c<=127)length+=1;else if(c<=2047)length+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&(text.charCodeAt(i+1)&0xfc00)===0xdc00){length+=4;i++;}else length+=3;}return length;}
