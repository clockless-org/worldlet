import {node} from '../../components/index.ts';
import {meetingLink} from '../../../core/applets/index.ts';
/** The Meetings Open view: the next calls from Calendar (each opens its web page inside Worldlet,
 * with Fox's brief), a new call on Google Meet, Zoom or Teams, and a pasted meeting link. */
export function renderMeetingsOpen(panel,room,items,value,pick){
 panel.classList.add('meetings-open');
 const sheet=node('section','meetings-open-sheet');panel.append(sheet);
 sheet.append(node('h2','',room.title));
 const calls=items.filter(item=>item.kind!=='new'),services=items.filter(item=>item.kind==='new');
 const upcoming=node('section','meetings-upcoming');upcoming.setAttribute('aria-label','Upcoming calls');sheet.append(upcoming);
 upcoming.append(node('h3','','Upcoming'));
 if(!calls.length)upcoming.append(node('p','meetings-empty',value?.error||(value?.connected===false?'Connect Google Calendar with Fox to see your calls here.':'No calls with a meeting link coming up.')));
 for(const item of calls.slice(0,8)){
  const button=node('button','meetings-call');button.type='button';button.dataset.itemId=item.id;button.dataset.live=String(!!item.live);
  const when=node('time','meetings-when',item.when);if(item.start)when.dateTime=new Date(item.start).toISOString();
  const text=node('span','meetings-call-text');text.append(node('strong','',item.title),node('small','',item.context));
  button.append(when,text,node('span','meetings-join',item.live?'Join now':'Open'));
  button.onclick=()=>pick(item);upcoming.append(button);
 }
 const start=node('section','meetings-new');start.setAttribute('aria-label','New meeting');sheet.append(start);
 start.append(node('h3','','New meeting'));
 const choices=node('div','meetings-services');start.append(choices);
 for(const item of services){const button=node('button','meetings-service',item.title);button.type='button';button.dataset.itemId=item.id;button.dataset.service=item.service;button.title=item.context;button.onclick=()=>pick(item);choices.append(button);}
 // A link from a chat or email: only recognized Meet, Zoom and Teams call addresses open.
 const form=node('form','meetings-link');form.setAttribute('aria-label','Join with a link');
 const input=node('input');input.type='url';input.placeholder='Paste a Meet, Zoom or Teams link';input.setAttribute('aria-label','Meeting link');input.autocomplete='off';input.spellcheck=false;
 const join=node('button','','Join');join.type='submit';const hint=node('small','meetings-link-hint');
 form.append(input,join,hint);start.append(form);
 form.onsubmit=event=>{event.preventDefault();const link=meetingLink(input.value);if(!link){hint.textContent='That is not a Google Meet, Zoom or Teams call link.';input.focus();return;}hint.textContent='';value?.openLink?.(link.url,link.provider);};
 // Calls transcribed here, newest first; each opens its text (kept in the World, never audio).
 const saved=Array.isArray(value?.transcripts)?value.transcripts.slice(0,6):[];
 if(saved.length){
  const list=node('section','meetings-transcripts');list.setAttribute('aria-label','Transcripts');sheet.append(list);
  list.append(node('h3','','Transcripts'));
  for(const t of saved){
   const button=node('button','meetings-transcript');button.type='button';button.dataset.session=t.session;
   const when=new Date(t.startedAt*1000);
   button.append(node('strong','',t.meeting||'Meeting'),node('small','',when.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+when.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+' · '+t.lines+(t.lines===1?' line':' lines')));
   button.onclick=()=>value?.openTranscript?.(t.session,t.meeting);list.append(button);
  }
 }
 if(value?.scope)sheet.append(node('p','meetings-scope',value.scope));
 return calls.slice(0,8);
}
