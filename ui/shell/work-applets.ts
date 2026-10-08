import {localPathName} from '../../core/context/index.ts';
import {CODING_SESSIONS} from '../../core/applets/index.ts';
import {practiceJobSession,practiceJobDetail} from '../practice/index.ts';
// CLI records remain local UI data. Listing or reading never resumes an agent.
export const WORK_APPLETS=['github',...CODING_SESSIONS];
export function workItems(key,result){
 if(key==='github')return (result.repositories||[]).map(repo=>({id:repo.id,title:repo.title,context:repo.description,when:repo.status,repo}));
 const rows=result.sessions||result.providers?.find(p=>p.provider===(key==='codex'?'codex':'claude'))?.sessions||[];
 return rows.map(session=>({id:session.id||session.sessionId,title:session.title,context:localPathName(session.cwd)||'',when:session.status||'Saved',executionState:session.status||'Saved',session}));
}
export function workError(key,result){
 if(result.error)return result.error;
 const provider=result.providers?.find(p=>p.provider===(key==='codex'?'codex':'claude'));
 return provider&&provider.state!=='ready'?({not_installed:'Install '+(key==='codex'?'Codex':'Claude Code')+' to read local sessions.',adapter_missing:'The local session reader is missing. Ask Fox to help repair it.',needs_attention:'Could not read local sessions. Ask Fox to retry.'}[provider.state]||'Could not read this tool.') : '';
}
export function renderWorkDetail(host,key,value,renderMarkdown,onMore){
 const el=(tag,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
 host.replaceChildren();
 if(value.error){host.append(el('p',value.error,'app-device-error'));return;}
 if(key==='github'){
  const r=value.repository||{};host.append(el('h2',r.name),el('p',r.description),el('p',[r.branch,r.language,r.stars!=null?r.stars+' stars':''].filter(Boolean).join(' · '),'ui-caption'));
  for(const [title,rows] of [['Pull requests',value.pullRequests||[]],['Issues',value.issues||[]]]){
   host.append(el('h3',title));if(!rows.length)host.append(el('p','No open '+title.toLowerCase()+'.','ui-caption'));
   for(const item of rows){const article=el('article','','work-repo-entry');article.append(el('strong','#'+item.number+' · '+item.title),el('p',item.author,'ui-caption'));host.append(article);}
  }
 }else{
  for(const m of value.messages||[]){const article=el('article','','codex-message');article.append(el('h3',m.role==='user'?'You':key==='codex'?'Codex':'Claude Code'));article.append(renderMarkdown(m.text,{title:'Session message',path:'session.md'}));host.append(article);}
  if(!value.messages?.length)host.append(el('p','No saved text messages on this page.','ui-caption'));
 }
 if(value.scope)host.append(el('p',value.scope,'ui-caption'));
 if(value.nextOffset!=null){const next=el('button','Next messages','work-detail-next') as HTMLButtonElement;next.type='button';next.onclick=()=>onMore(value.nextOffset);host.append(next);}
}
// Explicit fictional presets; the same Open/Focus presentation consumes them.
export function sampleWork(key,state: any={}){
 if(key==='github')return {repositories:[{id:'sample/village',title:'village',description:'A small personal world.',status:'Saved',branch:'main'},{id:'sample/field-notes',title:'field-notes',description:'Notes from the workshop.',status:'Saved',branch:'main'}]};
 return {usage:key==='codex'?{placeholder:true}:null,sessions:[...(key==='codex'?(state.jobs||[]).map(practiceJobSession):[]),{id:'sample:'+key+':1',sessionId:'sample-'+key+'-1',title:'Polish the village',cwd:'/worldlet',status:state[key+':1']?'Completed':'Running',provider:key==='codex'?'codex':'claude'},{id:'sample:'+key+':2',sessionId:'sample-'+key+'-2',title:'Review navigation',cwd:'/worldlet',status:state[key+':2']?'Completed':'Waiting for you',provider:key==='codex'?'codex':'claude'}]};
}
export function sampleWorkDetail(item){if(item.session?.practiceJob)return practiceJobDetail(item.session.practiceJob);return item.repo?{repository:{name:item.repo.title,description:item.repo.description,branch:'main'},pullRequests:[{number:12,title:'Softer afternoon light',author:'Worldlet'}],issues:[{number:7,title:'Keep the path clear',author:'Worldlet'}],scope:'Fictional repository.'}:{messages:[{role:'user',text:'Please review this part of the village.'},{role:'assistant',text:item.session.status==='Completed'?'Prepared result: the view returns to its entry context, the selected Applet stays visible, and navigation checks pass in this authored example.':item.session.status==='Running'?'Checking the village layout and the path back from Focus. This is a prepared execution state for the walkthrough.':'The navigation change is ready for review. Ask Fox to show the prepared result.'}],scope:'Fictional conversation. No coding tool is running.'};}
