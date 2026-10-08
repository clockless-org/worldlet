import {firstValueCandidate} from '../../core/onboarding/index.ts';
import {connectionLive,sourcesReading} from '../../core/applets/index.ts';
import {createCoachMark,createTourSpotlight,elementBox} from './tour-spotlight.ts';

/**
 * The second half of the first-run tour (owner design 2026-10-02, ui/onboarding/README.md): the
 * person gives Fox one real thing to do and watches it happen.
 *
 * 5. Pick: the spotlight boxes the item Fox picked in the Attention Center; **Show me** (or a click
 *    on it) opens its card in the middle, and the box glides from the item to the card.
 * 6. Card: Fox asks “Can I do this for you?”; **Do it for me** opens the item's page full size in
 *    its Applet, where the person watches Fox work and can step in (owner feedback 2026-10-02: no
 *    picture in picture for Fox's pages; leaving shows a badge on the Applet instead). The card's
 *    own Done (Got it for something to know) works too and settles the item as the first win; its
 *    Dismiss and Later wait until the tour is over (owner request 2026-10-04).
 * 7. Fox's only question while it works is the **Go ahead** before a last step that submits,
 *    sends, books or pays (owner decision 2026-10-03: nothing is confirmed afterwards). Once Fox
 *    has checked the result page that tap settles the item, and the first win follows Fox's reply.
 *    When Fox's turn ends with the item still open (Fox could not finish, or took no last step),
 *    Fox says so: **Mark it done** if the person finished it, or **Not yet**.
 *
 * Like the first half only what the step asks for responds, and the Tutorial switch in the corner, turned off, ends it
 * (world-tour.ts). Someone who brought an Agent and has no item yet starts with what they keep talking
 * about with it: Fox boxes the theme in the Center, and the artifact Fox makes from those conversations with
 * **Show me** is the first win (owner requests 2026-10-06 and 2026-10-07). Without either Fox says it is still reading and waits up to a minute
 * (two while a source is still being read or what it read still waits for Attention synthesis; five
 * while the host's Attention is still working on it, `attentionReading`, as a first synthesis on a slow
 * model takes longer than two (Mac RC 3001)). With nothing connected (Not now on Gmail) there is nothing to
 * wait for: only a brought Agent's conversations, which reach the Center within fifteen seconds of the World
 * opening, so after the first half of the tour Fox does not wait at all (owner request 2026-10-06). Then the
 * tour ends and the World is free, instead of staying locked until an item arrives; the phone step follows (world-tour.ts).
 * Stages persist (`first-value`, `-review`, `-running`, `-outcome`), so a restart resumes the step;
 * an interrupted operation is never replayed.
 */
const WAIT=60000,BROUGHT_WAIT=15000,READING_WAIT=300000;

export function mountFirstValue({root,view,call,state:initial,arriving=false}){
 let winning='',skipped=false,state=initial,shown='',quiet=false,writing=Promise.resolve(),arrival=arriving,pendingWrites=0,destroyed=false,arrivalTimer:ReturnType<typeof setTimeout>|undefined;
 const active=()=>String(state.onboarding?.journeyStage||'').startsWith('first-value');
 const stage=()=>String(state.onboarding?.journeyStage||'');
 const spotlight=createTourSpotlight(root);
 // `focus` names what the spotlight shows now, so a tick only redraws on a change. `waitingSince`
 // starts the wait for a first item; `ending` is set once the tour ends without one.
 let focus='',waitingSince=0,ending=false,keeping=false;
 const mountedAt=Date.now();
 // The step's main action is filled, a second choice quiet (owner request 2026-10-06; world-tour.ts).
 const button=(label,run,quiet=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=quiet?'world-tour-quiet':'world-tour-primary';b.onclick=()=>void run();return b;};
 function guide(text,actions=[],takeover=false){if(destroyed)return;view.setGuide({source:'first-value',text,actions,takeover});view.revealGuide();}
 async function save(next,itemId=state.onboarding?.journeyItemId){
  state={...state,onboarding:{...state.onboarding,journeyStage:next,...itemId?{journeyItemId:itemId}:{}}};
  pendingWrites++;
  writing=writing.catch(()=>{}).then(()=>call('onboarding',{operation:'journey',stage:next,...itemId?{itemId}:{}}));
  try{await writing;return true;}catch{guide('Your progress could not be saved.',[button('Retry',()=>save(next,itemId))]);return false;}finally{pendingWrites--;}
 }
 const same=(key:string)=>shown===key&&(quiet||view.guideSource==='first-value');
 const overview=()=>!view.current||view.current==='overview';
 const journeyItem=()=>(state.worldItems||[]).find(item=>item.id===state.onboarding?.journeyItemId);
 function box(key:string,step:Parameters<typeof spotlight.show>[0]){if(focus===key&&spotlight.active)return;focus=key;spotlight.show(step);}
 function unbox(){focus='';spotlight.hide();}
 function tick(){offer();coachRunning();}
 // While Fox works on the page, the person always knows what they can do (owner feedback 2026-10-02):
 // a note by Back says it shrinks the page into the world while Fox carries on. The page's label says
 // Fox's step and the bubble invites them to watch or step in, so no two places say the same thing.
 const coach=createCoachMark();
 function coachRunning(){
  const back=root.querySelector('#notionBack') as HTMLElement|null;
  if(!destroyed&&active()&&stage()==='first-value-running'&&quiet&&!overview()&&back&&!back.hidden)coach.show(back,'Press Back to shrink this page into your world. I’ll keep going and tell you when it’s done.');
  else coach.hide();
 }
 function offer(){
  if(quiet&&!['first-value-running','first-value-outcome'].includes(stage()))quiet=false;
  if(destroyed||!active()||arrival||keeping||view.busy&&stage()!=='first-value-running'){if(!active()||destroyed)unbox();return;}
  const now=stage();
  if(now==='first-value-review')return review();
  if(now==='first-value-running'||now==='first-value-outcome')return resume(now);
  if(!overview()||root.dataset.attentionPreview==='true'){unbox();return;}
  pick();
 }
 // 5. Pick the item Fox can do.
 function pick(){
  // Pick among the rows the Center shows, so the box has the item to surround.
  const shownRows=[...root.querySelectorAll('.world-matter[data-world-item-id]')].filter(row=>row.getClientRects().length).map(row=>String((row as HTMLElement).dataset.worldItemId));
  const candidate=firstValueCandidate(state.worldItems||[],Date.now(),shownRows);
  if(!candidate){
   // Someone who brought an Agent already has work in progress: what they keep talking about with it becomes the
   // first thing Fox does with them (owner request 2026-10-06), before any mail is read.
   const proposalRows=new Set([...root.querySelectorAll('.world-ongoing[data-ongoing]')].filter(row=>row.getClientRects().length).map(row=>String((row as HTMLElement).dataset.ongoing)));
   const theme=(view.ongoingProposals?.()||[]).find(p=>proposalRows.has(p.id));
   if(theme)return pickOngoing(theme);
   const reading=sourcesReading(state.connections||[]),connected=(state.connections||[]).some(connectionLive);
   if(!waitingSince)waitingSince=Date.now();
   // Mail being read gets its minute (two while a source is still reading, five while Attention still works on it). With nothing
   // connected nothing will arrive but a brought Agent's conversations, which reach the Center within a short while of the World
   // opening: counted from then, it is long over by the end of the tour's first half, so Fox never waits on an empty Center.
   const waited=connected?Date.now()-waitingSince:Date.now()-mountedAt;
   if(!ending&&waited<(!connected?BROUGHT_WAIT:state.attentionReading?READING_WAIT:reading?2*WAIT:WAIT)){
    if(!same('waiting')){shown='waiting';guide(connected?'I’m still reading your mail. **In a moment I’ll pick something I can do for you.**':'Give me a moment to look around your world. **I’ll pick something we can do together.**');}
    box('waiting',{target:()=>elementBox(root,'.world-task-tracker')});
    return;
   }
   // Nothing to do together yet: the tour ends and the World is the person's, instead of staying locked
   // until an item arrives (owner request 2026-10-06).
   unbox();
   if(ending)return;ending=true;
   void save('finish').then(saved=>{
    if(!saved){ending=false;return;}
    guide(connected?'Nothing needs you right now. **Your world is yours to explore.** As soon as something comes in, I’ll show you how I can help.'
     :'**Your world is yours to explore.** Ask me anything here, or connect Mail or Calendar and I’ll find things I can do for you.');
    root.dispatchEvent(new CustomEvent('worldlet:first-value-ended'));
   });
   return;
  }
  waitingSince=0;
  const id=String(candidate.id),title=String(candidate.title||'').trim();
  // Fox can finish only an item the Center holds under Later: turning to the Later page reveals its row to box.
  if(!shownRows.includes(id)){
   const more=root.querySelector('.world-task-more-button[data-page="later"]') as HTMLButtonElement|null;
   if(more){more.click();root.querySelector('.world-matter[data-world-item-id="'+CSS.escape(id)+'"]')?.scrollIntoView({block:'nearest'});}
  }
  // Show me opens the card in the middle, and the box glides from the item to it.
  const open=async()=>{if(await save('first-value-review',id))view.previewAttention(id);};
  if(!same('pick:'+id)){shown='pick:'+id;guide('Let’s try one together. '+(title?'I picked this one for you: **'+title+'**.':'I picked one for you.'),[button('Show me',()=>void open())]);}
  box('pick:'+id,{target:()=>elementBox(root,'.world-matter[data-world-item-id="'+CSS.escape(id)+'"]'),act:()=>void open()});
 }
 // 5 for a brought Agent: Fox boxes a theme of the conversations it brought (core/ongoing/themes.ts) and offers to pull it
 // together on one page; the artifact Fox shows is the first win (Kelvin 2026-10-07: an artifact, not an Applet).
 function pickOngoing(theme:{id:string,title:string,say:string}){
  waitingSince=0;
  const id='ongoing:'+theme.id;
  const make=async()=>{
   if(keeping)return;keeping=true;unbox();shown='making:'+id;
   try{
    // The artifact is no Attention item, so the finished journey names none (the host rejects an id it does not hold).
    if(await view.makeOngoing(theme.id)){await win(id,'');return;}
    // Fox could not make it (no model, or the turn failed): the tour ends and the World is the person's, as when
    // there is nothing to do together.
    if(!await save('finish',''))return;
    guide('**Your world is yours to explore.** Ask me anything here, or connect Mail or Calendar and I’ll find things I can do for you.');
    root.dispatchEvent(new CustomEvent('worldlet:first-value-ended'));
   }catch(error){shown='';guide(String((error as Error)?.message||'That didn’t finish. Please try again.'));}
   finally{keeping=false;}
  };
  if(!same('pick:'+id)){shown='pick:'+id;guide('Let’s start with something you already do. '+theme.say,[button('Show me',make)]);}
  box('pick:'+id,{target:()=>elementBox(root,'.world-ongoing[data-ongoing="'+CSS.escape(theme.id)+'"]'),act:()=>void make()});
 }
 // 6. The card is open: Fox asks to do it.
 function review(){
  const item=journeyItem(),id=String(state.onboarding?.journeyItemId||'');
  if(!item||!firstValueCandidate([item])){unbox();if(!same('unavailable')){shown='unavailable';guide('That item is no longer waiting for you. **Let’s pick another one.**',[button('Pick another',async()=>{if(await save('first-value')){shown='';tick();}})]);}return;}
  if(root.dataset.attentionPreview!=='true'){
   // A restart or a closed card: open it again, since the tour waits on this choice. The card's
   // source opens its Applet (Mail): the spotlight lifts there and the card comes back on return.
   if(!overview()){unbox();shown='';return;}
   if(!view.busy)view.previewAttention(id);
   return;
  }
  const task=item.kind==='task';
  if(!same('card:'+id)){
   shown='card:'+id;
   guide(task?'Here it is. **Can I do this for you?** I’ll open it right here, and you can step in any time.':'Here’s what I found. This one is worth **knowing**.',
    [task?button('Do it for me',()=>{unbox();if(!view.helpWithAttention?.(id))view.previewAttention(id);})
     :button('Continue',async()=>{unbox();await view.settleAttention?.(id,'read');})]);
  }
  // The card is lit to its own edge while Fox stays where it always stands, its question in its bubble (owner feedback
  // 2026-10-06: Fox moving up under the card read as a jump). Fox's button goes on with Fox; the card's own Done (or Got
  // it) works too (owner request 2026-10-04).
  box('card:'+id,{target:()=>elementBox(root,'#attentionPreview'),flush:true,open:'#attentionPreview :is(.attention-preview-original,.attention-preview-provenance.is-link,.attention-preview-action-primary)'});
 }
 // 7–8 and after: Fox works, then asks once whether it is done.
 function resume(now:string){
  const item=journeyItem(),id=String(state.onboarding?.journeyItemId||'');
  if(!item||!firstValueCandidate([item])&&now!=='first-value-outcome'){
   unbox();if(same('unavailable'))return;shown='unavailable';
   guide('That item is no longer waiting for you. **Let’s pick another one.**',[button('Pick another',async()=>{if(await save('first-value')){shown='';tick();}})]);return;
  }
  if(now==='first-value-running'){
   // While Fox's own turn runs the bubble is Fox's; after a restart the turn is gone.
   if(quiet)return;
   unbox();if(same('resume'))return;shown='resume';
   guide('Your task was interrupted. **Let’s look at it again**; I won’t repeat anything automatically.',[button('Open it',async()=>{if(await save('first-value-review',id))view.previewAttention(id);})]);return;
  }
  // first-value-outcome: Fox's reply is the result. An item the person's Go ahead settled has
  // its first win; one Fox could not finish stays open and says so.
  if(item.status==='done'){if(!winning&&shown!=='won:'+id){shown='won:'+id;void win(id);}return;}
  if(same('done:'+id))return;shown='done:'+id;
  const reply=String(view.lastReply||'').trim();
  guide((reply?reply.split(/\n\n/)[0]+'\n\n':'')+'**It’s still open.**',[
   button('Mark it done',()=>view.settleAttention?.(id,'done',{by:'fox'})),
   button('Not yet',()=>view.previewAttention(id),true),
  ],true);
 }
 const prepareArrival=()=>{arrival=true;};
 const finishArrival=()=>{clearTimeout(arrivalTimer);arrivalTimer=setTimeout(()=>{arrival=false;tick();},8000);};
 const attentionHelp=async(event:any)=>{
  if(destroyed||!active())return;
  const {id,phase,result}=event.detail;
  if(phase==='started'){shown='running';quiet=true;unbox();await save('first-value-running',id);tick();return;}
  if(state.onboarding?.journeyItemId!==id)return;
  if(!result||result.outcome!=='complete'){shown='';quiet=false;await save('first-value-review',id);return;}
  if(!await save('first-value-outcome',id))return;
  quiet=false;shown='';tick();
 };
 root.addEventListener('worldlet:prepare-arrival',prepareArrival);
 window.addEventListener('worldlet:applet-arrival',finishArrival);
 // Settling the journey item (the Go ahead on Fox's last step, Mark it done, or the card's own
 // Done) is the first win. While Fox is still replying, the celebration waits for its reply.
 const celebrate=()=>{
  if(destroyed||!winning)return;
  if(view.busy){setTimeout(celebrate,400);return;}
  const id=winning;winning='';
  // Celebrate in the world, where the checked-off item and the fireworks are visible,
  // not behind the website Fox just finished, in an Applet or open over the World (#1923).
  if(view.current&&view.current!=='overview'||view.pageOpen)view.showOverview?.();
  guide('**That’s your first win!** I’ll keep watching for what matters and help whenever you need me.',[],true);
  root.dispatchEvent(new CustomEvent('worldlet:first-win',{detail:{id}}));
  window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'first_win'}));
 };
 async function win(id:string,itemId=id){
  unbox();
  if(!await save('finish',itemId))return;
  winning=id;celebrate();
 }
 const settled=async(event:any)=>{
  if(destroyed||!active()||event.detail?.id!==state.onboarding?.journeyItemId||!['done','read'].includes(event.detail?.status))return;
  event.preventDefault();shown='won:'+event.detail.id;
  await win(event.detail.id);
 };
 window.addEventListener('worldlet:fox-idle',celebrate);
 root.addEventListener('worldlet:attention-settled',settled);
 root.addEventListener('worldlet:attention-help',attentionHelp);
 // The tour hands over at once, without waiting for the next snapshot to carry the stage.
 const tourDone=()=>{if(destroyed||state.onboarding?.journeyStage!=='world-tour')return;state={...state,onboarding:{...state.onboarding,journeyStage:'first-value'}};tick();};
 root.addEventListener('worldlet:world-tour-done',tourDone);
 // The Tutorial switch turned off (world-tour.ts saves the finished journey): first value ends where it is.
 const tourSkipped=()=>{if(destroyed||!active())return;skipped=true;state={...state,onboarding:{...state.onboarding,journeyStage:'finish'}};shown='';quiet=false;unbox();coach.hide();};
 root.addEventListener('worldlet:tour-skipped',tourSkipped);
 const timer=setInterval(tick,1000);
 return {update(next){
  if(skipped&&String(next.onboarding?.journeyStage||'').startsWith('first-value'))next={...next,onboarding:{...next.onboarding,journeyStage:'finish'}};else if(skipped)skipped=false;
  state=pendingWrites?{...next,onboarding:state.onboarding}:next;tick();},destroy(){destroyed=true;clearInterval(timer);spotlight.destroy();coach.destroy();clearTimeout(arrivalTimer);root.removeEventListener('worldlet:prepare-arrival',prepareArrival);window.removeEventListener('worldlet:applet-arrival',finishArrival);window.removeEventListener('worldlet:fox-idle',celebrate);winning='';root.removeEventListener('worldlet:attention-help',attentionHelp);root.removeEventListener('worldlet:attention-settled',settled);root.removeEventListener('worldlet:world-tour-done',tourDone);root.removeEventListener('worldlet:tour-skipped',tourSkipped);}};
}
