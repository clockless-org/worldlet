// Source-backed recording jobs. These never start a CLI or report real validation.
export const PRACTICE_BUILD_MS=8000;
export function practiceJobStatus(job,now=Date.now()){
 return job.reviewed?'Completed':now-job.startedAt>=PRACTICE_BUILD_MS?'Ready for review':'Running';
}
export function practiceJobSession(job){return {id:job.id,sessionId:job.id,title:job.title,cwd:'/worldlet',provider:'codex',status:practiceJobStatus(job),practiceJob:job};}
export function createPracticeJob(args,state,now=Date.now()){
 if(!String(args.title||'').trim()||!String(args.task||'').trim())return {error:'Provide a title and coding request.'};
 const sources=args.excerpts||[];
 if(!sources.length)return {error:'Read the design document first, then delegate with its note_ids.'};
 if(!sources.some(s=>['sample-notion-design-latest','sample-notion-navigation-latest'].includes(s.id)))return {error:'Read an authored design brief before this practice handoff; it is not a general code generator.'};
 if(sources.some(s=>!s.id?.startsWith('sample-')||!s.text))return {error:'Only authored practice sources can be used here.'};
 const previous=(state.jobs||[]).find(j=>j.operationId===args.operationId&&args.operationId);
 if(previous)return {job:previous};
 return {job:{id:'practice-code-'+crypto.randomUUID(),operationId:args.operationId,title:String(args.title).slice(0,100),task:String(args.task).slice(0,2000),sources:sources.map(s=>({id:s.id,title:s.title,text:s.text.slice(0,3500)})),startedAt:now,reviewed:false}};
}
export function practiceJobDetail(job){
 const status=practiceJobStatus(job),ready=status!=='Running';
 if(job.sources.some(s=>s.id==='sample-notion-navigation-latest'))return {messages:[{role:'user',text:job.task},{role:'assistant',text:'## Original design from Notion\n'+job.sources.map(s=>'### '+s.title+'\n'+s.text).join('\n\n')},{role:'assistant',text:ready?'## Ready for review\nThe navigation design and acceptance criteria are attached to this coding request.\n\nPrepared handoff example — no CLI execution or generated code is claimed.':'## Context received\nThe source document and acceptance criteria are attached. Preparing the review handoff…'}],scope:'Practice handoff · original Notion context · no live CLI run.',status};
 return {messages:[{role:'user',text:job.task},
 {role:'assistant',text:'## Design brief\n'+job.sources.map(s=>'### '+s.title+'\n'+s.text).join('\n\n')},
 {role:'assistant',text:ready?'## Prepared implementation\n- A calm, keyboard-accessible timer with start, pause and reset.\n- The original design stays attached above for review.\n- Open the working prototype from Fox to try it.\n\nThis is a template implementation for the walkthrough; it is not a claim that Codex generated or tested a project.':'## In the workshop\nThe design brief is attached. Preparing the walkthrough prototype…'}],scope:'Local practice task · no CLI, repository changes or external writes.',status};
}
