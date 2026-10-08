import {node} from '../../components/index.ts';
/** The bar over a call while it is transcribed: always visible, with Stop and a reminder to tell the
 * others. `update` takes the host's state (`phase:'transcript'` events from the website panel). */
export function transcriptBar(onStop:()=>void){
 const bar=node('div','meeting-transcribing');bar.setAttribute('role','status');
 const dot=node('span','meeting-transcribing-dot');dot.setAttribute('aria-hidden','true');
 const text=node('span','meeting-transcribing-text');
 const label=node('strong','','Transcribing');
 const detail=node('small','','Only text is kept, in your World. Let everyone in the call know.');
 text.append(label,detail);
 const stop=node('button','meeting-transcribing-stop','Stop');stop.type='button';stop.onclick=onStop;
 bar.append(dot,text,stop);
 return {element:bar,update(state:any){
  const active=state?.active!==false;bar.dataset.active=String(active);stop.hidden=!active;
  label.textContent=active?'Transcribing':state?.waiting?'Finishing the transcript…':'Transcript saved';
  const parts=[];
  if(state?.last)parts.push(String(state.last).slice(0,160));
  else parts.push('Only text is kept, in your World. Let everyone in the call know.');
  if(state?.waiting>1)parts.push(state.waiting+' parts waiting');
  if(state?.dropped)parts.push('some audio was skipped to keep up');
  if(state?.error)parts.push(String(state.error));
  detail.textContent=parts.join(' · ');
 }};
}
const clock=(seconds:number)=>new Date(seconds*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
/** A saved transcript, line by line (speaker in bold), plain text only. */
export function renderTranscript(container:HTMLElement,{meeting,lines}:{meeting:string,lines:{at:number,text:string,speaker:string}[]}){
 const article=node('article','meeting-transcript');article.setAttribute('aria-label','Transcript of '+meeting);
 const head=node('header','meeting-transcript-head');head.append(node('h1','',meeting||'Meeting'));
 if(lines.length)head.append(node('p','',new Date(lines[0].at*1000).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+' · '+clock(lines[0].at)+' – '+clock(lines.at(-1)!.at)+' · '+lines.length+' lines'));
 article.append(head);
 if(!lines.length)article.append(node('p','meeting-transcript-empty','Nothing was heard in this transcript.'));
 for(const line of lines){
  const row=node('p','meeting-transcript-line');row.dataset.speaker=line.speaker==='You'?'you':'others';
  const text=line.text.replace(/^(?:You|Others): /,'');
  row.append(node('time','',clock(line.at)),node('strong','',line.speaker||'Someone'),node('span','',text));
  article.append(row);
 }
 container.append(article);
 return article;
}
