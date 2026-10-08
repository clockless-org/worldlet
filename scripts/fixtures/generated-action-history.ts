import {createCompanionAI} from '../../ui/companion/companion-ai.ts';
import {attentionRequest} from '../../core/agent/index.ts';
import {firstValueRequest} from '../../core/onboarding/index.ts';
import {validateConversationHistory} from '../../core/companion/conversation-history.ts';

const w=window as any,key='synthetic-action-history';
w.turns=[];w.saved=JSON.parse(localStorage.getItem(key)||'[]');
w.execution=attentionRequest('Help me with this next step: Summarize this item. Read the saved evidence first, then complete it directly.','synthetic-notification','Fictional garden club notification',firstValueRequest('synthetic-notification',['https://example.test/fictional-garden']));
w.manual='My own detailed garden notes. '+('Please preserve this handwritten paragraph exactly. '.repeat(50))+' End of my manual message.';
w.hold=false;
w.fox=createCompanionAI(async()=>({}),{
 request:async()=>({ok:true,json:async()=>({configured:false})}),
 nativeCall:async(action,body)=>{if(action==='conversationRecall'){if(body?.rows){validateConversationHistory(body.rows,true);w.saved=body.rows;localStorage.setItem(key,JSON.stringify(body.rows));}return w.saved;}return {};},
 modelOptions:async()=>({provider:'agent'}),
 runAgent:async body=>{w.turns.push(body);if(w.hold)await new Promise(resolve=>w.finish=resolve);return {message:'The fictional garden club meets on Saturday. This is a synthetic reply.'};}
})({button:document.querySelector('#trigger'),input:document.querySelector('#notionInput'),status:document.querySelector('#status'),execute:async()=>({ok:true})});
// As in notion-world.ts, the host owns the composer form; unwired, Send navigates the page away.
document.querySelector<HTMLInputElement>('#notionInput')!.form!.onsubmit=e=>{e.preventDefault();w.fox.submit();};
w.view=(name='garden')=>w.fox.setContext({key:'notes',title:'Fictional garden club',detail:name});w.view();
const button=(id:string,run:()=>void)=>document.querySelector<HTMLButtonElement>('#'+id)!.onclick=run;
button('generated',()=>{w.hold=true;w.pending=w.fox.ask(w.execution,{displayText:'Summarize this item'});});
button('delta',()=>{w.turns.at(-1).onStatus?.('Reading fictional sources','reading');w.turns.at(-1).onDelta?.('A synthetic partial reply');});
button('finish',()=>{w.hold=false;w.finish?.();});
button('manual',()=>{const input=document.querySelector<HTMLInputElement>('#notionInput')!;input.value=w.manual;input.form!.requestSubmit();});
button('legacy',()=>{localStorage.setItem(key,JSON.stringify([{key:'fox-thread',view:'',text:'',entries:[{id:'legacy',key:'notes',view:'',location:'Fictional garden club',user:w.execution,text:'Saved synthetic answer.',steps:[],status:'done',at:Date.now()}]}]));location.reload();});
button('reload',()=>location.reload());
button('reset',()=>{localStorage.removeItem(key);location.reload();});
w.ready=true;
