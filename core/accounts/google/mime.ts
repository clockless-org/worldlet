// A plain-text UTF-8 message as Python's EmailMessage writes it with the default policy (`set_content(text)` and
// `as_bytes()`): LF line ends, the same header order and the same body transfer encoding (7bit or 8bit up to
// 78-byte lines, otherwise the shorter of quoted-printable and base64). Non-ASCII header words are RFC 2047
// encoded words; Python's exact folding is not reproduced, only what a reader decodes. Private.
const MAX=78,enc=new TextEncoder();
const ascii=(s:string)=>/^[\x00-\x7f]*$/.test(s);
const latin1=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return s;};
const hex=(b:number)=>'='+b.toString(16).toUpperCase().padStart(2,'0');
export function base64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}

/** quoprimime.body_encode(body, 78) over one character per byte. */
function quotedPrintable(body:string){
 if(!body)return body;
 body=body.replace(/[^ -<>-~\t\r\n]/g,c=>hex(c.charCodeAt(0)));
 const out:string[]=[];
 for(const line of body.split(/\r\n|\r|\n/).slice(0,/[\r\n]$/.test(body)?-1:undefined)){
  let start=0;const laststart=line.length-1-MAX;
  while(start<=laststart){
   const stop=start+MAX-1;
   if(line[stop-2]==='='){out.push(line.slice(start,stop-1));start=stop-2;}
   else if(line[stop-1]==='='){out.push(line.slice(start,stop));start=stop-1;}
   else{out.push(line.slice(start,stop)+'=');start=stop;}
  }
  const end=line[line.length-1];
  if(end===' '||end==='\t'){
   const room=start-laststart;
   out.push(line.slice(start,-1)+(room>=3?hex(end.charCodeAt(0)):room===2?end+'=\n':'=\n'+hex(end.charCodeAt(0))));
  }else out.push(line.slice(start));
 }
 if(/[\r\n]$/.test(body))out.push('');
 return out.join('\n');
}
/** The body and its Content-Transfer-Encoding, as email.contentmanager._encode_text decides them. */
function encodeText(text:string):[string,string]{
 const lines=text.split(/\r\n|\r|\n/);
 if(/[\r\n]$/.test(text))lines.pop();
 const bytes=lines.map(line=>enc.encode(line)),join=(n=lines.length)=>lines.slice(0,n).map(l=>l+'\n').join('');
 if(Math.max(0,...bytes.map(b=>b.length))<=MAX)return [lines.every(ascii)?'7bit':'8bit',join()];
 const sniff=enc.encode(join(10)),qp=quotedPrintable(latin1(sniff));
 if(qp.length<=base64(sniff).length+1){
  if(lines.length<=10)return ['quoted-printable',qp];
  return ['quoted-printable',quotedPrintable(latin1(enc.encode(join())))];
 }
 const all=enc.encode(join());let data='';
 for(let i=0,n=(MAX>>2)*3;i<all.length;i+=n)data+=base64(all.subarray(i,i+n))+'\n';
 return ['base64',data];
}

/** RFC 2047 `=?utf-8?q?…?=` words (Python's header alphabet), each at most 75 characters. */
function encodedWords(text:string){
 const words:string[]=[];let word='';
 for(const c of text){
  const q=/[A-Za-z0-9!*+/-]/.test(c)?c:c===' '?'_':[...enc.encode(c)].map(hex).join('');
  if(word.length+q.length>63){words.push(word);word='';}
  word+=q;
 }
 if(word)words.push(word);
 return words.map(w=>'=?utf-8?q?'+w+'?=');
}
/** Free text: plain ASCII words (a long one stays whole, as in Python), runs of words with other characters as
 * encoded words, folded before a word when the line would pass 78 characters. */
function unstructured(name:string,value:string){
 const tokens=value.split(' '),items:string[][]=[];
 for(let i=0;i<tokens.length;){
  if(ascii(tokens[i])){items.push([tokens[i++]]);continue;}
  let j=i+1;
  while(j<tokens.length&&!ascii(tokens[j]))j++;
  items.push(encodedWords(tokens.slice(i,j).join(' ')));i=j;
 }
 let out=name+':',line=out.length,first=true;
 for(const words of items)for(const word of words){
  const fold=!first&&word!==''&&line+1+word.length>MAX;
  out+=(fold?'\n ':' ')+word;line=fold?1+word.length:line+1+word.length;first=false;
 }
 return out;
}
/** An addr-spec, its non-ASCII atoms as encoded words. */
const mailbox=(name:string,value:string)=>name+': '+value.split(/([@.])/).map(part=>ascii(part)?part:encodedWords(part).join(' ')).join('');

export function plainMessage(headers:{from:string;to:string;subject:string;messageId:string;inReplyTo?:string;references?:string},body:string){
 if(Object.values(headers).some(value=>/[\r\n]/.test(value)))throw new Error('Header values may not contain linefeed or carriage return characters');
 const [cte,data]=encodeText(body);
 const lines=[mailbox('From',headers.from),mailbox('To',headers.to),unstructured('Subject',headers.subject),'Message-ID: '+headers.messageId];
 if(headers.inReplyTo)lines.push(unstructured('In-Reply-To',headers.inReplyTo),unstructured('References',headers.references));
 lines.push('Content-Type: text/plain; charset="utf-8"','Content-Transfer-Encoding: '+cte,'MIME-Version: 1.0');
 return enc.encode(lines.join('\n')+'\n\n'+data);
}
