import {mailIdentity,mailTime,mailAvatar} from './presentation.ts';
import {appletSurface} from '../../components/index.ts';
/** Mail owns its stable Focus layout. Source text stays separate from Fox summaries. */
export function parseMail(text:string){
 const lines=String(text||'').replace(/\r\n/g,'\n').split('\n'),headers:Record<string,string>={};let end=0,found=false;
 for(let i=0;i<Math.min(lines.length,24);i++){
  const line=lines[i],match=line.match(/^(?:#{1,3}\s+)?(From|To|Cc|Date|Subject|Status):\s*(.*)$/i);
  if(match){headers[match[1].toLowerCase()]=match[2].trim();found=true;end=i+1;continue;}
  if(!line.trim()){if(found&&Object.keys(headers).some(k=>k!=='status')){end=i+1;break;}continue;}
  // Sample notes may have an introductory heading before their original headers.
  if(!headers.from&&!headers.subject&&/^# /.test(line))continue;
  break;
 }
 return {headers,body:found?lines.slice(end).join('\n'):text};
}
const INVISIBLE=/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u3164\ufeff\uffa0]/g;
// A long tracking URL says nothing to a reader; its site does. Short URLs stay as written.
function urlLabel(url:string){
 try{const u=new URL(url),host=u.hostname.replace(/^www\./,'');return url.length<=48?url.replace(/^https?:\/\//,'').replace(/\/$/,''):host+(u.pathname.length>1||u.search?'/…':'');}catch{return url;}
}
function labelLinks(text:string){
 return text.replace(/(\[[^\]\n]*\]\(<[^>\n]*>\)|\[[^\]\n]*\]\([^)\s]*\))|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>()\]]*[^\s<>()\].,;:!?'"])/g,(all,link,angled,bare)=>{
  if(link)return link;const url=angled||bare;return '['+urlLabel(url).replace(/[[\]]/g,'')+'](<'+url.replace(/>/g,'%3E')+'>)';
 });
}
// Reflow soft-wrapped prose, retaining paragraph/list/quote boundaries and every word, with
// invisible preheader padding, image placeholders and ruled separators made even.
export function readableMail(text:string){
 const even=text.replace(/\r\n/g,'\n').replace(INVISIBLE,'').replace(/\u00a0/g,' ').replace(/\[image:[^\]\n]*\]/gi,'')
  .replace(/^[ \t]*[-=_*~]{4,}[ \t]*$/gm,'\n---\n').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
 return labelLinks(even.split('\n\n').map(p=>/^(?:\s*[-*>#|`]|\s*\d+[.)]\s)/m.test(p)?p:p.replace(/([^\n])\n(?=\S)/g,'$1 ')).join('\n\n'));
}
/** Split a reply from the earlier message it quotes, so the quote can start folded. */
export function splitQuoted(text:string):{main:string,quoted:string} {
 const lines=text.split('\n');
 const attribution=(line:string)=>/^\s*(?:On\s.{4,240}\swrote:|在.{2,120}写道[:：]|.{2,120}于.{2,120}写道[:：]|Le\s.{4,200}a écrit\s?:|Am\s.{4,200}schrieb.{0,120}:)\s*$/i.test(line);
 let at=-1;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  // Outlook's rule (made `---` by readableMail) before a From: header block.
  if(/^\s*-{2,}\s*(?:Original Message|Forwarded message|原始邮件|转发的邮件)\s*-{2,}\s*$/i.test(line)||/^(?:_{10,}|---)\s*$/.test(line)&&/^\s*(?:From|发件人)[:：]/i.test(lines.slice(i+1).find(l=>l.trim())||'')){at=i;break;}
  if(attribution(line)||attribution((lines[i-1]||'')+' '+line)&&!attribution(lines[i-1]||'')){
   const start=attribution(line)?i:i-1;let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
   if(j<lines.length&&lines.slice(j).every(l=>!l.trim()||/^\s*>/.test(l))){at=start;break;}
  }
  if(/^\s*>/.test(line)&&lines.slice(i).every(l=>!l.trim()||/^\s*>/.test(l))){at=i;break;}
 }
 const main=at>0?lines.slice(0,at).join('\n').trim():'';
 return main?{main,quoted:lines.slice(at).join('\n').trim()}:{main:text,quoted:''};
}
type MailValue={text:string,title:string,displayTitle?:string,summary?:string,mail?:{headers?:Record<string,string>,attachments?:{name:string,size?:number}[]},messages?:MailValue[]};
export function renderMailFocus(value:MailValue,renderBody:(text:string,page:any)=>HTMLElement){
 const el=(tag:string,cls:string,text?:string)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
 const messages=value.messages?.length?value.messages:[value];
 const parsed=messages.map(message=>({message,...parseMail(message.text)}));
 const firstHeaders={...parsed[0].headers,...parsed[0].message.mail?.headers};
 const surface=appletSurface({title:firstHeaders.subject||parsed[0].message.title});
 const root=surface.element;root.classList.add('mail-focus');root.setAttribute('aria-label','Email reader');
 surface.heading.classList.add('mail-page-title');surface.meta.remove();surface.footer.remove();
 function identity(entry){
  const headers={...entry.headers,...entry.message.mail?.headers},who=mailIdentity(headers.from||'');
  const header=el('header','mail-identity-card'),person=el('div','mail-person');
  person.append(el('strong','mail-sender-name','From '+who.name));
  if(who.address)person.append(el('span','mail-address',who.address));
  for(const key of ['to','cc'])if(headers[key])person.append(el('span','mail-recipient',(key==='to'?'To ':'Cc ')+headers[key]));
  const when=mailTime(headers.date||''),date=el('time','mail-date',when.label);date.title=when.exact;if(when.iso)date.setAttribute('datetime',when.iso);
  const portrait=mailAvatar(headers.from||'',entry.message.mail?.avatar||'');portrait.classList.add('mail-sender-portrait');header.append(person,portrait,date);return header;
 }
 function original(entry){
  const article=el('section','mail-message');
  // Retain original links, inline images, lists and tables from the safe Markdown renderer.
  const {main,quoted}=splitQuoted(readableMail(entry.body));
  const text=renderBody(main,{title:entry.message.title,path:'email.md'});article.append(text);
  // The fold sits inside the message column, aligned with its paragraphs.
  if(quoted){const fold=el('details','mail-quoted'),label=el('summary','','Show quoted text');label.setAttribute('aria-label','Show the earlier message quoted in this reply');fold.append(label,renderBody(quoted,{title:entry.message.title,path:'email.md'}));text.append(fold);}
  if(entry.message.mail?.attachments?.length){
   const attachments=el('section','mail-attachments');attachments.append(el('h3','','Attachments'));
   for(const file of entry.message.mail.attachments){const row=el('div','mail-attachment');row.append(el('strong','mail-file-name',file.name));if(file.size)row.append(el('span','',Math.ceil(file.size/1024)+' KB'));attachments.append(row);}
   article.append(attachments);
  }
  return article;
 }
 const paper=surface.body;paper.classList.add('mail-paper');paper.tabIndex=0;paper.setAttribute('aria-label','Email content');paper.append(identity(parsed[0]),original(parsed[0]));
 for(const entry of parsed.slice(1)){
  const headers={...entry.headers,...entry.message.mail?.headers},details=el('details','mail-thread-message'),summary=el('summary','');
  summary.textContent=[mailIdentity(headers.from||'').name,mailTime(headers.date||'').label,headers.subject||entry.message.title].filter(Boolean).join(' · ');
  details.append(summary,identity(entry),original(entry));paper.append(details);
 }
 root.append(paper);
 const align=()=>{const switcher=root.closest('#notionWorld')?.querySelector<HTMLElement>('.mail-reader-switch');if(!switcher)return;const h=root.getBoundingClientRect(),p=switcher.parentElement.getBoundingClientRect();switcher.style.left=h.right-p.left-116+'px';switcher.style.right='auto';switcher.style.width='96px';switcher.style.top=h.top-p.top+16+'px';};
 const resize=new ResizeObserver(align);resize.observe(root);
 const cleanup=new MutationObserver(()=>{if(!root.isConnected){resize.disconnect();cleanup.disconnect();}});
 requestAnimationFrame(()=>{if(root.isConnected){cleanup.observe(root.closest('#notionContent')||root.parentNode!,{childList:true,subtree:true});align();}else resize.disconnect();});
 return root;
}
