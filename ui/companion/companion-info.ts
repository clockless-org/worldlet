import {readCompanionProfile,type CompanionKnowledge,type CompanionProfile} from '../../contracts/companion.ts';
import {companionPersona} from '../../agent/companion/index.ts';
import {node,uiIcon} from '../components/index.ts';
import {isDesktopCompanion,requireWorldSurface} from './world-surface.ts';
import {eventTrigger,reportProductEvent} from '../shell/index.ts';
import {createCompanionFeedback} from './companion-feedback.ts';
import {createActivityRecords} from './activity-records.ts';
import {createCompanionArtifacts,mountJournalBook} from '../artifacts/index.ts';
import {createCompanionPhone} from './companion-phone.ts';
import {companionStill} from '../themes/index.ts';
import {createCompanionSettings} from './companion-settings.ts';
import {readFoxSkills,skillOffers,type FoxSkills} from './companion-skills.ts';

/** Companion controls; dismiss from the close button or outside the panel. */
export function mountCompanionInfo({root,pet,call,getName}){
 const el:(tag:string,cls?:string,text?:unknown)=>any=node;
 const badge=el('button','companion-entry-action');badge.type='button';badge.dataset.slot='companion';pet.append(badge);
 const desktop=isDesktopCompanion;
 function syncEntry(){badge.innerHTML=uiIcon('companion');badge.title='Open companion panel';badge.setAttribute('aria-label',badge.title);badge.setAttribute('aria-haspopup','dialog');badge.setAttribute('aria-expanded',String(panel.open));badge.setAttribute('aria-controls',panel.id);}
 const panel=el('dialog','companion-info-panel ui-hud-panel');panel.id='companionInfo';panel.setAttribute('aria-label','Your companion');badge.setAttribute('aria-controls',panel.id);root.append(panel);
 // Agent beside Fox lands on Settings › Agents (owner Order 2026-10-07); the badge on Fox's profile.
 // With `setting` (Fox's Agent and Phone buttons) it opens that section, and closes only when it is already showing.
 async function toggle(section='Profile',setting?:string){if(desktop()){badge.disabled=true;try{await requireWorldSurface(call);await open(section,setting);}catch(error){badge.title=error.message||'Could not reopen World. Try again.';}finally{badge.disabled=false;}return;}if(panel.open&&(!setting||settings.selected===setting))dismiss(true);else await open(section,setting);}
 badge.onclick=e=>{e.stopPropagation();void toggle();};
 syncEntry();
 let dismissClick=false;
 const feedback=createCompanionFeedback({call,onVoice:phase=>root.dataset.feedbackVoice=phase});
 // Every recorded event, for the Worldlet team, folded away in Settings › Help.
 const records=createActivityRecords({call});
 // Feedback opens from Settings › Help in a small panel of its own over the World (owner request 2026-10-11: back
 // into Settings; no button in the World's corner), so Fox stays in view to dictate into it.
 const feedbackPanel=el('dialog','companion-feedback-panel ui-hud-panel');feedbackPanel.id='worldFeedback';feedbackPanel.setAttribute('aria-label','Feedback');
 const feedbackClose=el('button','companion-info-close','×');feedbackClose.type='button';feedbackClose.setAttribute('aria-label','Close feedback');
 feedbackPanel.append(feedback.element,feedbackClose);root.append(feedbackPanel);
 // Closing hands focus back to Settings beside Fox, where Feedback was opened from.
 const settingsButton=()=>root.querySelector('.companion-side .companion-panel-button') as HTMLElement|null;
 function closeFeedback(focus=false){if(!feedbackPanel.open)return;void feedback.cancelVoice();feedbackPanel.close();if(focus)settingsButton()?.focus();}
 async function openFeedback(){
  if(desktop()){try{await requireWorldSurface(call);}catch{return;}}
  if(panel.open)dismiss();journal.close();feedbackPanel.show();(feedback.element.querySelector('textarea') as HTMLElement|null)?.focus();
 }
 feedbackClose.onclick=()=>closeFeedback(true);
 feedbackPanel.addEventListener('cancel',e=>{e.preventDefault();closeFeedback(true);});
 root.addEventListener('pointerdown',e=>{const t=e.target as Node;if(feedbackPanel.open&&!feedbackPanel.contains(t)&&!(t as Element).closest?.('.companion-avatar,.companion-text-entry'))closeFeedback();},true);
 window.addEventListener('keydown',e=>{if(feedbackPanel.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeFeedback(true);}},true);
 const phone=createCompanionPhone({call});
 // An artifact opens again in the World; the Journal steps aside first.
 const artifacts=createCompanionArtifacts({call,open:id=>{journal.close();window.dispatchEvent(new CustomEvent('worldlet:artifact-open',{detail:{id}}));},openMade:(made,keep)=>{journal.close();window.dispatchEvent(new CustomEvent('worldlet:artifact-open',{detail:{made,keep}}));},
  // A reply card that needs send access or a delivery check goes on in Fox's email review.
  review:detail=>{journal.close();window.dispatchEvent(new CustomEvent('worldlet:email-review',{detail}));}});
 // The Journal is a book of its own over the World (owner request 2026-10-08), opened by today's date in the World's top-left corner.
 const journal=mountJournalBook({root,pages:artifacts.element,start:(day,card)=>artifacts.start(day,card),stop:()=>artifacts.stop(),returnFocus:()=>document.querySelector<HTMLElement>('.world-today-open')});
 async function openJournal(day='',card=''){
  const trigger=eventTrigger();
  if(desktop()){try{await requireWorldSurface(call);}catch(error){badge.title=error.message||'Could not reopen World. Try again.';return;}}
  if(panel.open)dismiss();journal.open(day,card);
  if(!journal.isOpen)return;
  reportProductEvent('journal_opened',{trigger});
 }
 // The panel is one settings window (owner request 2026-10-10): Fox's profile and Phone are sections in its one list
 // beside the settings, and Help opens Feedback and the tutorial; the World view lends the sample switch and host features.
 const profileHost=el('div','companion-profile-host');
 // What Fox knows shows in Settings › Context, beside what the Agent keeps (owner request 2026-10-11: one place for memory).
 const knowsHost=el('div','companion-settings-fox-knows');
 const PAGE_SECTION={fox:'Profile',phone:'Mobile'};
 const settings=createCompanionSettings({call,host:()=>root.companionSettingsHost,pages:{fox:profileHost,phone:phone.element,knows:knowsHost},records,close:()=>dismiss(),
  // Help's Feedback and Show the tutorial leave Settings for the World: the feedback panel, or the tour (world-tour.ts).
  openFeedback:()=>void openFeedback(),replayTutorial:()=>{dismiss();root.dispatchEvent(new CustomEvent('worldlet:tutorial-replay'));},
  onShow:id=>{panel.dataset.section=PAGE_SECTION[id]||'Settings';}});
 root.companionSettings=settings.element;
 let anchorFrame=0,anchorKey='';
 function anchorPanel(){
  if(!panel.open)return;
  const width=Math.min(1040,innerWidth-32),height=Math.min(660,innerHeight-32),left=(innerWidth-width)/2,top=(innerHeight-height)/2;
  const key=[left,top,height,width].join(':');
  if(key!==anchorKey){anchorKey=key;Object.assign(panel.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});}
  anchorFrame=requestAnimationFrame(anchorPanel);
 }
 // Old section names still open their section: the old Energy page is Agent now, the Journal is a book of its own (owner request
 // 2026-10-08) and Feedback a panel of its own; History, Sounds and Privacy are gone (owner request 2026-10-10). Accounts and
 // the standing rules Approvals listed are parts of Settings › Agents now: Settings opens it at that part (companion-settings.ts MOVED).
 const SECTION_ID:Record<string,string>={Profile:'fox',Energy:'model',Mobile:'phone',iPhone:'phone',Phone:'phone',Accounts:'integrations',Integrations:'integrations',Approvals:'approvals'};
 let model:any=null,snapshot:any=null,profile:Partial<CompanionProfile>={},error='',busy=false,generation=0;
 const openGroups=new Set<string>(['user']);
 // The skills the World shows and Fox's offers to save a repeated task (companion-skills.ts).
 let skills:FoxSkills|null=null,skillNote='';
 async function loadSkills(){try{skills=readFoxSkills(await call('foxSkills',{operation:'list'}));}catch{skills=null;}if(panel.open&&!busy)render();}
 function button(label,action){const b=el('button','companion-info-action',label);b.type='button';b.onclick=action;return b;}
 async function run(action){if(busy)return;busy=true;error='';render();try{await action();}catch(e){error=e.message||'Please try again.';}finally{busy=false;render();}}
 function dismiss(focus=false){generation++;records.stop();cancelAnimationFrame(anchorFrame);panel.close();root.classList.remove('companion-info-open');badge.setAttribute('aria-expanded','false');if(focus)(badge.isConnected?badge:pet.querySelector('.companion-panel-button')||badge).focus();root.dispatchEvent(new Event('worldlet:companion-info-closed'));}
 window.addEventListener('worldlet:desktop-companion',event=>{if((event as CustomEvent).detail&&root.classList.contains('companion-info-open'))dismiss();syncEntry();});
 const close=button('×',()=>dismiss(true));close.className='companion-info-close';close.setAttribute('aria-label','Close companion panel');
 const notice=el('p','companion-info-note');notice.setAttribute('role','status');notice.hidden=true;
 const body=el('div','companion-info-body');body.append(settings.element,notice);panel.append(body,close);
 // The name is renamed right here (owner Order 2026-10-12): click it or Rename, type, Enter saves and Escape cancels.
 // It saves like telling Fox to, so the World, desktop Fox, the message bar and the phone all follow.
 let renaming:string|null=null,renameNote='';
 function nameRow(){
  const current=profile.name||getName()||'Fox';
  if(renaming===null){
   const heading=el('h2','companion-name');
   const name=el('button','companion-name-text',current);name.type='button';name.title='Rename';name.setAttribute('aria-label','Rename '+current);
   const rename=el('button','companion-name-rename','Rename');rename.type='button';rename.setAttribute('aria-label','Rename '+current);
   name.onclick=rename.onclick=()=>{renaming=current;renameNote='';render();};
   heading.append(name);
   const row=el('div','companion-name-row');row.append(heading,rename);
   if(renameNote)row.append(el('p','companion-info-note',renameNote));
   return row;
  }
  const form=el('form','companion-name-edit'),field=el('input');field.type='text';field.value=renaming;field.maxLength=24;field.setAttribute('aria-label','Companion name');field.autocomplete='off';field.spellcheck=false;
  const save=el('button','companion-info-action','Save');save.type='submit';
  const cancel=el('button','companion-info-action','Cancel');cancel.type='button';
  const stop=()=>{renaming=null;render();};
  field.oninput=()=>{renaming=field.value;};
  field.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();stop();}};
  cancel.onclick=stop;
  form.onsubmit=async e=>{
   e.preventDefault();const value=field.value.trim();
   if(!value||value===current){stop();return;}
   save.disabled=field.disabled=true;
   try{await call('foxPreferenceChange',{setting:'companion_name',value});profile={...profile,name:value};renaming=null;renameNote='';}
   catch(error){renameNote=(error as Error)?.message||'Could not rename. Try again.';save.disabled=field.disabled=false;}
   render();
  };
  form.append(field,save,cancel);
  if(renameNote)form.append(el('p','companion-info-note',renameNote));
  queueMicrotask(()=>{if(field.isConnected&&!field.disabled&&document.activeElement!==field){field.focus();field.select();}});
  return form;
 }
 function render(){
  notice.textContent=error;notice.hidden=!error;
  const page=el('section','companion-info-section companion-profile-page');page.dataset.section='Profile';
  const side=el('div','companion-info-profile'),portrait=el('img'),environment=(globalThis as any).__WORLDLET_ENV_ASSETS__;
  // A theme with its own companion shows that companion's portrait, not Fox's.
  portrait.src=companionStill();portrait.alt=environment?.companionRive?'Fox portrait':'Companion portrait';side.setAttribute('aria-label','Companion profile');
  side.append(portrait,nameRow(),el('p','','Your companion'));
  const facts=el('dl','companion-profile-facts'),born=new Date(profile.createdAt||'');
  const birthday=Number.isFinite(born.getTime())?born.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not available';
  for(const [label,value] of [['Birthday',birthday],['Personality',companionPersona(profile.personality).summary]])facts.append(el('dt','',label),el('dd','',value));
  side.append(facts);
  side.append(el('small','',model?model.available?'Ready to help':'Model not connected':'Checking connection…'));
  function knowledgeBlock(knowledge:CompanionKnowledge){
   // What the World holds about the companion: its saved memory, then what each other Agent brought.
   const name=profile.name||getName()||'Fox';
   const block=el('section','companion-profile-knowledge');block.setAttribute('aria-label','What '+name+' knows');
   block.append(el('h3','','What '+name+' knows'));
   const plural=(n:number,word:string)=>n+' '+word+(n===1?'':'s');
   const group=(key:string,title:string,summary:string,fill:(body:HTMLElement)=>void)=>{
    const details=el('details','companion-knowledge-group');details.dataset.group=key;details.open=openGroups.has(key);
    details.ontoggle=()=>{if(details.open)openGroups.add(key);else openGroups.delete(key);};
    const head=el('summary');head.append(el('span','companion-knowledge-title',title),el('span','companion-knowledge-count',summary));
    const body=el('div','companion-knowledge-body');fill(body);details.append(head,body);block.append(details);
   };
   const list=(items:string[],limit=60)=>{const ul=el('ul');for(const item of items.slice(0,limit))ul.append(el('li','',item));if(items.length>limit)ul.append(el('li','companion-knowledge-more','and '+(items.length-limit)+' more'));return ul;};
   // Hermes keeps one entry per `§` line; other memory is paragraphs.
   const entries=(text:string)=>text.split(/\n\s*§\s*\n/).flatMap(part=>part.split(/\n{2,}/)).map(part=>part.trim()).filter(Boolean);
   let saved=0;
   for(const [kind,title] of [['user','About you'],['longTerm','Memory'],['soul','Persona']] as const){
    const memories=knowledge.memories.filter(memory=>memory.kind===kind),items=memories.flatMap(memory=>entries(memory.text));
    if(!items.length)continue;saved+=items.length;
    const sources=[...new Set(memories.map(memory=>memory.source).filter(Boolean))];
    group(kind,title,items.length+(items.length===1?' entry':' entries'),body=>{body.append(list(items,200));if(sources.length)body.append(el('p','companion-knowledge-source','Saved from '+sources.join(', ')));});
   }
   if(!saved)block.append(el('p','companion-info-note','Nothing saved yet. '+name+' remembers as you talk.'));
   if(!snapshot?.sampleEnabled){const edit=button('Edit memory',()=>{dismiss();window.dispatchEvent(new Event('worldlet:memory-manager'));});edit.classList.add('companion-knowledge-edit');block.append(edit);}
   if(knowledge.conversations)block.append(el('p','companion-knowledge-line',name+'’s own conversation: '+plural(knowledge.conversations,'message')));
   // What other Agents' conversations and notes Fox can look through. Their skills and scheduled tasks are the Agent's
   // own and are listed only in Settings › Agents (owner decision 2026-10-11), where they can be changed.
   for(const agent of knowledge.brought){
    const parts=[[agent.conversations,'message'],[agent.notes,'daily note']].filter(([n])=>Number(n)>0).map(([n,word])=>plural(Number(n),String(word)));
    if(!parts.length)continue;
    group('from:'+agent.source,'From '+agent.title,parts.join(' · '),body=>body.append(el('p','companion-knowledge-line',name+' can look through these conversations and daily notes when you ask.'+(agent.source==='openclaw'&&Number(agent.notes)>0?' Each day’s note is also that day’s page in your Journal.':''))));
   }
   // Fox's offers to save a task it keeps repeating, answered right here; the skills themselves are in Settings › Agents.
   if(skills&&!snapshot?.sampleEnabled){
    const state=skills;
    block.append(...skillOffers(state,{el,button,name,act:(operation,id)=>run(async()=>{const result=await call('foxSkills',{operation,id});skills=readFoxSkills(result)??skills;skillNote=typeof result?.note==='string'?result.note:'';})}));
    if(skillNote)block.append(el('p','companion-info-note companion-skill-note',skillNote));
   }
   return block;
  }
  // Fox's page is who Fox is; what it knows is in Settings › Context, and the example cards of what it can do went
  // (owner request 2026-10-11: Settings has too much; the tutorial shows that).
  knowsHost.replaceChildren(...profile.knowledge?[knowledgeBlock(profile.knowledge)]:[]);
  page.append(side);
  profileHost.replaceChildren(page);
 }
 async function open(section='Profile',setting?:string){if(root.dataset.onboardingLocked==='true'&&root.dataset.onboardingAddApplet!=='true')return;if(section==='Journal'||section==='Artifacts'){await openJournal();return;}if(section==='Feedback'){await openFeedback();return;}journal.close();closeFeedback();delete root.dataset.onboardingFinish;const id=section==='Settings'?setting||settings.selected||'agents':SECTION_ID[section]||'fox';records.start();void phone.refresh();void loadSkills();settings.open(id);if(panel.open){render();return;}const ticket=++generation;render();panel.show();anchorKey='';cancelAnimationFrame(anchorFrame);anchorPanel();root.classList.add('companion-info-open');badge.setAttribute('aria-expanded','true');root.dispatchEvent(new Event('worldlet:companion-info-opened'));const results=await Promise.allSettled([call('modelStatus'),call('snapshot'),call('companionProfile').then(readCompanionProfile)]);if(!panel.open||ticket!==generation)return;model=results[0].status==='fulfilled'?results[0].value:null;snapshot=results[1].status==='fulfilled'?results[1].value:null;profile=results[2].status==='fulfilled'?results[2].value:profile;if(results.some(r=>r.status==='rejected'))error='Some status information is unavailable. Try reopening the panel.';render();}
 root.addEventListener('worldlet:onboarding-applet-added',()=>dismiss());
 window.addEventListener('worldlet:companion-info',e=>void open((e as CustomEvent).detail?.tab||'Profile',(e as CustomEvent).detail?.setting));
 // The World opens the book on a day: the morning brief and the day's summary (owner request 2026-10-08).
 // `day` opens that page, and `card` brings one card on it into view (an Attention item for the morning brief does).
 window.addEventListener('worldlet:journal-open',e=>void openJournal(String((e as CustomEvent).detail?.day||''),String((e as CustomEvent).detail?.card||'')));
 panel.addEventListener('cancel',e=>{e.preventDefault();dismiss(true);});
 root.addEventListener('pointerdown',e=>{if(panel.open&&!panel.contains(e.target as Node)&&!badge.contains(e.target as Node)){if((e.target as Element).closest('.companion-avatar,.companion-text-entry'))return;dismissClick=true;dismiss();e.preventDefault();e.stopImmediatePropagation();}},true);
 root.addEventListener('click',e=>{if(dismissClick){dismissClick=false;e.preventDefault();e.stopImmediatePropagation();return;}if(panel.open&&!panel.contains(e.target as Node)&&!(e.target as Element).closest('.companion-avatar,.companion-text-entry'))dismiss();},true);
 window.addEventListener('keydown',e=>{if(panel.open&&e.key==='Escape'&&renaming===null){e.preventDefault();e.stopImmediatePropagation();dismiss(true);}},true);
 window.addEventListener('worldlet:companion-appearance',e=>{profile={...profile,...(e as CustomEvent).detail};if(panel.open)render();});
 return {open,toggle,entry:badge,feedback,journal:{toggle:()=>journal.isOpen?journal.close(true):void openJournal(),get isOpen(){return journal.isOpen;}},get openSection(){return journal.isOpen?'Journal':panel.open?panel.dataset.section||null:null;},get feedbackActive(){return feedbackPanel.open;}};
}
