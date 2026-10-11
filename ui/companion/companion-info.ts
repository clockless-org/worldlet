import {readCompanionProfile,type CompanionKnowledge,type CompanionProfile} from '../../contracts/companion.ts';
import {companionPersona} from '../../core/companion/index.ts';
import {node,uiIcon} from '../components/index.ts';
import {isDesktopCompanion,requireWorldSurface} from './world-surface.ts';
import {createCompanionFeedback} from './companion-feedback.ts';
import {createCompanionHistory} from './companion-history.ts';
import {createCompanionArtifacts,mountJournalBook} from '../artifacts/index.ts';
import {createCompanionPhone} from './companion-phone.ts';
import {companionStill} from '../themes/index.ts';
import {createCompanionSettings} from './companion-settings.ts';
import {readFoxSkills,skillList,skillOffers,type FoxSkills} from './companion-skills.ts';
import {COMPANION_LOOK_PRESETS,COMPANION_SCARF_COLORS,companionLookIsClassic,companionLookKey,normalizeCompanionLook,recolorCompanionPixels,type CompanionLook} from '../../core/companion/index.ts';

// What Fox can do, as things a person would actually say (owner feedback 2026-10-03: show real cases).
const ABILITIES:[icon:string,title:string,say:string,does:string][]=[
 ['mail','Mail','“What needs a reply today?”','Reads your inbox, finds what needs you and drafts replies for you to review.'],
 ['calendar','Calendar','“What’s coming up this week?”','Keeps Coming Up current and gets you ready before meetings.'],
 ['compass','Websites','“Find a short cooking video on YouTube.”','Works on a site in the background and shows each step. It asks before paying, sending or deleting.'],
 ['book','Remembers you','“Remember I’m vegetarian.”','Keeps what matters to you and uses it next time. You can view and correct it.'],
 ['clock','Routines','“Every morning at 8, tell me the weather and my first meeting.”','Runs on a schedule, also while Worldlet is closed once your Agent runs as a service here.'],
 ['file','Notes and files','“Find my notes about the Tokyo trip.”','Searches your notes, Obsidian vault and the files you brought in.'],
 ['spark','Code','“How is my Codex session going?”','Follows Claude Code and Codex sessions and your GitHub pull requests.'],
 ['chat','Talk or type','Hold Fox to talk, click it to type.','Any language. Fox answers in the conversation, or out loud if you turn that on.'],
];

// The profile portrait in each look, recolored like the animated companion's layers.
const lookPortraits=new Map<string,Promise<string>>();
function lookPortrait(src:string,look:CompanionLook){
 const key=companionLookKey(look);
 if(!lookPortraits.has(key))lookPortraits.set(key,new Promise((resolve,reject)=>{
  const image=new Image();image.onerror=reject;
  image.onload=()=>{
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);recolorCompanionPixels(pixels.data,look,{face:true});ctx.putImageData(pixels,0,0);
   resolve(canvas.toDataURL('image/png'));
  };
  image.src=src;
 }));
 return lookPortraits.get(key)!;
}

/** Companion controls; dismiss from the close button or outside the panel. */
export function mountCompanionInfo({root,pet,call,getName}){
 const el:(tag:string,cls?:string,text?:unknown)=>any=node;
 const badge=el('button','companion-entry-action');badge.type='button';badge.dataset.slot='companion';pet.append(badge);
 const desktop=isDesktopCompanion;
 function syncEntry(){badge.innerHTML=uiIcon('companion');badge.title='Open companion panel';badge.setAttribute('aria-label',badge.title);badge.setAttribute('aria-haspopup','dialog');badge.setAttribute('aria-expanded',String(panel.open));badge.setAttribute('aria-controls',panel.id);}
 const panel=el('dialog','companion-info-panel ui-hud-panel');panel.id='companionInfo';panel.setAttribute('aria-label','Your companion');badge.setAttribute('aria-controls',panel.id);root.append(panel);
 // Settings beside Fox lands on Your Agent (owner Order 2026-10-07); the badge on Fox's profile.
 async function toggle(section='Profile'){if(desktop()){badge.disabled=true;try{await requireWorldSurface(call);await open(section);}catch(error){badge.title=error.message||'Could not reopen World. Try again.';}finally{badge.disabled=false;}return;}if(panel.open)dismiss(true);else await open(section);}
 badge.onclick=e=>{e.stopPropagation();void toggle();};
 syncEntry();
 let dismissClick=false;
 const feedback=createCompanionFeedback({call,onVoice:phase=>root.dataset.feedbackVoice=phase});
 // A history line goes to its Applet or site; the panel steps aside first.
 const history=createCompanionHistory({call,connections:()=>snapshot?.connections||[],openApplet:id=>{dismiss();root.appletLayout?.open?.(id);},openSite:url=>{dismiss();window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url}}));}});
 const phone=createCompanionPhone({call});
 // An artifact opens again in the World; the Journal steps aside first.
 const artifacts=createCompanionArtifacts({call,open:id=>{journal.close();window.dispatchEvent(new CustomEvent('worldlet:artifact-open',{detail:{id}}));},openMade:(made,keep)=>{journal.close();window.dispatchEvent(new CustomEvent('worldlet:artifact-open',{detail:{made,keep}}));},
  // A reply card that needs send access or a delivery check goes on in Fox's email review.
  review:detail=>{journal.close();window.dispatchEvent(new CustomEvent('worldlet:email-review',{detail}));}});
 // The Journal is a book of its own over the World (owner request 2026-10-08), opened by today's date in the World's top-left corner.
 const journal=mountJournalBook({root,pages:artifacts.element,start:day=>artifacts.start(day),stop:()=>artifacts.stop(),returnFocus:()=>document.querySelector<HTMLElement>('.world-today-open')});
 async function openJournal(day=''){
  if(desktop()){try{await requireWorldSurface(call);}catch(error){badge.title=error.message||'Could not reopen World. Try again.';return;}}
  if(panel.open)dismiss();journal.open(day);
 }
 // The panel is one settings window (owner request 2026-10-10): Fox's profile, Phone, History and Feedback are sections
 // in its one list beside the settings; the World view lends the sample switch and host features.
 const profileHost=el('div','companion-profile-host');
 const PAGE_SECTION={fox:'Profile',phone:'Mobile',history:'History',feedback:'Feedback'};
 const settings=createCompanionSettings({call,host:()=>root.companionSettingsHost,pages:{fox:profileHost,phone:phone.element,history:history.element,feedback:feedback.element},history,close:()=>dismiss(),
  onShow:id=>{panel.dataset.section=PAGE_SECTION[id]||'Settings';if(id!=='feedback')void feedback.cancelVoice();}});
 root.companionSettings=settings.element;
 let anchorFrame=0,anchorKey='';
 function anchorPanel(){
  if(!panel.open)return;
  const width=Math.min(1040,innerWidth-32),height=Math.min(660,innerHeight-32),left=(innerWidth-width)/2,top=(innerHeight-height)/2;
  const key=[left,top,height,width].join(':');
  if(key!==anchorKey){anchorKey=key;Object.assign(panel.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});}
  anchorFrame=requestAnimationFrame(anchorPanel);
 }
 // Old section names still open their section: the old Energy page is Your Agent now, the Journal is a book of its own (owner request
 // 2026-10-08).
 const SECTION_ID:Record<string,string>={Profile:'fox',Energy:'model',History:'history',Mobile:'phone',iPhone:'phone',Phone:'phone',Feedback:'feedback'};
 let model:any=null,snapshot:any=null,profile:Partial<CompanionProfile>={},error='',busy=false,generation=0;
 const openGroups=new Set<string>(['user']);
 // The skills the World shows and Fox's offers to save a repeated task (companion-skills.ts).
 let skills:FoxSkills|null=null,skillNote='';
 async function loadSkills(){try{skills=readFoxSkills(await call('foxSkills',{operation:'list'}));}catch{skills=null;}if(panel.open&&!busy)render();}
 function button(label,action){const b=el('button','companion-info-action',label);b.type='button';b.onclick=action;return b;}
 async function run(action){if(busy)return;busy=true;error='';render();try{await action();}catch(e){error=e.message||'Please try again.';}finally{busy=false;render();}}
 function dismiss(focus=false){generation++;history.stop();cancelAnimationFrame(anchorFrame);void feedback.cancelVoice();panel.close();root.classList.remove('companion-info-open');badge.setAttribute('aria-expanded','false');if(focus)(badge.isConnected?badge:pet.querySelector('.companion-panel-button')||badge).focus();root.dispatchEvent(new Event('worldlet:companion-info-closed'));}
 window.addEventListener('worldlet:desktop-companion',event=>{if((event as CustomEvent).detail&&root.classList.contains('companion-info-open'))dismiss();syncEntry();});
 const close=button('×',()=>dismiss(true));close.className='companion-info-close';close.setAttribute('aria-label','Close companion panel');
 const notice=el('p','companion-info-note');notice.setAttribute('role','status');notice.hidden=true;
 const body=el('div','companion-info-body');body.append(settings.element,notice);panel.append(body,close);
 function render(){
  notice.textContent=error;notice.hidden=!error;
  // Profile on the left, what Fox can do scrolling on the right (owner feedback 2026-10-03).
  const page=el('section','companion-info-section companion-profile-page');page.dataset.section='Profile';
  const side=el('div','companion-info-profile'),portrait=el('img'),environment=(globalThis as any).__WORLDLET_ENV_ASSETS__;
  // A theme with its own companion shows that companion's portrait, not Fox's.
  portrait.src=companionStill();portrait.alt=environment?.companionRive?'Fox portrait':'Companion portrait';side.setAttribute('aria-label','Companion profile');
  side.append(portrait,el('h2','',profile.name||getName()||'Fox'),el('p','','Your companion'));
  const facts=el('dl','companion-profile-facts'),born=new Date(profile.createdAt||'');
  const birthday=Number.isFinite(born.getTime())?born.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not available';
  for(const [label,value] of [['Birthday',birthday],['Personality',companionPersona(profile.personality).summary]])facts.append(el('dt','',label),el('dd','',value));
  side.append(facts);
  // The look applies where the companion is the Rive rig.
  if(environment?.companionRive){
   const look=normalizeCompanionLook(profile.look);
   if(!companionLookIsClassic(look))void lookPortrait(portrait.src,look).then(url=>{if(portrait.isConnected)portrait.src=url;}).catch(()=>{});
   const identity=el('div','companion-profile-identity');identity.append(...side.childNodes);side.classList.add('has-look');side.append(identity,lookPicker(look));
  }
  side.append(el('small','',model?model.available?'Ready to help':'Model not connected':'Checking connection…'));
  if(profile.knowledge)side.append(knowledgeBlock(profile.knowledge));
  function lookPicker(look:CompanionLook){
   // Presets set fur and scarf together; the scarf row changes only the scarf.
   const block=el('div','companion-look');block.setAttribute('role','group');block.setAttribute('aria-label','Look');
   const wear=(value:string)=>run(async()=>{const result=await call('foxPreferenceChange',{setting:'companion_look',value});profile={...profile,look:result.look};});
   const swatch=(label:string,fill:string,selected:boolean,value:string,accent?:string)=>{
    const b=el('button','companion-look-swatch');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(selected));b.disabled=busy;
    b.style.setProperty('--look-fill',fill);if(accent)b.style.setProperty('--look-accent',accent);
    b.onclick=()=>{if(!selected)void wear(value);};return b;
   };
   const presets=el('div','companion-look-row');
   for(const preset of COMPANION_LOOK_PRESETS)presets.append(swatch(preset.title,preset.fur??'#e2793a',look.preset===preset.id,preset.id,preset.scarf??'#5d6b3f'));
   const scarves=el('div','companion-look-row companion-look-scarves'),scarf=look.scarf??COMPANION_SCARF_COLORS[0];
   for(const color of COMPANION_SCARF_COLORS)scarves.append(swatch('Scarf '+color,color,scarf===color,'fur='+(look.fur??'default')+' scarf='+(color===COMPANION_SCARF_COLORS[0]?'default':color)));
   block.append(el('h4','','Look'),presets,el('span','companion-look-label','Scarf'),scarves,el('p','companion-look-hint','Or tell '+(profile.name||getName()||'Fox')+' how to look.'));
   return block;
  }
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
   for(const agent of knowledge.brought){
    const parts=[[agent.conversations,'message'],[agent.notes,'note'],[agent.skills.length,'skill'],[agent.routines.length,'routine']].filter(([n])=>Number(n)>0).map(([n,word])=>plural(Number(n),String(word)));
    if(!parts.length)continue;
    group('from:'+agent.source,'From '+agent.title,parts.join(' · '),body=>{
     if(agent.conversations||agent.notes)body.append(el('p','companion-knowledge-line',name+' can look through these conversations and notes when you ask.'));
     if(agent.skills.length)body.append(el('h4','','Skills'),list(agent.skills));
     if(agent.routines.length)body.append(el('h4','','Routines'),list(agent.routines.map(routine=>routine.schedule?routine.name+' · '+routine.schedule:routine.name)));
    });
   }
   // Every skill with when it last ran, then Fox's offers to save a task it keeps repeating, answered right here.
   if(skills&&!snapshot?.sampleEnabled){
    const state=skills;
    if(state.skills.length)group('skills','Skills',plural(state.skills.length,'skill'),body=>body.append(skillList(state,{el})));
    block.append(...skillOffers(state,{el,button,name,act:(operation,id)=>run(async()=>{const result=await call('foxSkills',{operation,id});skills=readFoxSkills(result)??skills;skillNote=typeof result?.note==='string'?result.note:'';})}));
    if(skillNote)block.append(el('p','companion-info-note companion-skill-note',skillNote));
   }
   return block;
  }
  let grid=el('div','companion-info-grid');
  function card(icon,title,description,label?,action?){const c=el('section','companion-info-card'),symbol=el('span','companion-info-symbol');symbol.innerHTML=uiIcon(icon);const body=el('div');body.append(el('h4','',title),el('p','',description));c.append(symbol,body);if(label){const b=button(label,()=>run(action));b.disabled=busy;c.append(b);}grid.append(c);return c;}
  function abilitiesSection(){
   const section=el('div','companion-abilities');section.setAttribute('aria-label','What '+(profile.name||getName()||'Fox')+' can do');
   section.append(el('h3','','What '+(profile.name||getName()||'Fox')+' can do'),el('p','companion-abilities-intro','Just ask, in your own words. A few things people say:'));
   grid=el('div','companion-info-grid companion-abilities-grid');section.append(grid);
   for(const [icon,title,say,does] of ABILITIES){const c=card(icon,title,does);c.querySelector('h4').after(el('q','companion-ability-say',say));}
   const memory=card('book','Your memory','See and correct what '+(profile.name||getName()||'Fox')+' remembers about you.','Open',async()=>{dismiss();window.dispatchEvent(new Event('worldlet:memory-manager'));});
   memory.classList.add('companion-ability-memory');
   return section;
  }
  page.append(side,abilitiesSection());
  profileHost.replaceChildren(page);
 }
 async function open(section='Profile',setting?:string){if(root.dataset.onboardingLocked==='true'&&root.dataset.onboardingAddApplet!=='true')return;if(section==='Journal'||section==='Artifacts'){await openJournal();return;}journal.close();delete root.dataset.onboardingFinish;const id=section==='Settings'?setting||settings.selected||'model':SECTION_ID[section]||'fox';history.start();void phone.refresh();void loadSkills();settings.open(id);if(panel.open){render();return;}const ticket=++generation;render();panel.show();anchorKey='';cancelAnimationFrame(anchorFrame);anchorPanel();root.classList.add('companion-info-open');badge.setAttribute('aria-expanded','true');root.dispatchEvent(new Event('worldlet:companion-info-opened'));const results=await Promise.allSettled([call('modelStatus'),call('snapshot'),call('companionProfile').then(readCompanionProfile)]);if(!panel.open||ticket!==generation)return;model=results[0].status==='fulfilled'?results[0].value:null;snapshot=results[1].status==='fulfilled'?results[1].value:null;profile=results[2].status==='fulfilled'?results[2].value:profile;if(results.some(r=>r.status==='rejected'))error='Some status information is unavailable. Try reopening the panel.';render();}
 root.addEventListener('worldlet:onboarding-applet-added',()=>dismiss());
 window.addEventListener('worldlet:companion-info',e=>void open((e as CustomEvent).detail?.tab||'Profile',(e as CustomEvent).detail?.setting));
 // The World opens the book on a day: the morning brief and the day's summary (owner request 2026-10-08).
 window.addEventListener('worldlet:journal-open',e=>void openJournal(String((e as CustomEvent).detail?.day||'')));
 panel.addEventListener('cancel',e=>{e.preventDefault();dismiss(true);});
 root.addEventListener('pointerdown',e=>{if(panel.open&&!panel.contains(e.target as Node)&&!badge.contains(e.target as Node)){if((e.target as Element).closest('.companion-avatar,.companion-text-entry'))return;dismissClick=true;dismiss();e.preventDefault();e.stopImmediatePropagation();}},true);
 root.addEventListener('click',e=>{if(dismissClick){dismissClick=false;e.preventDefault();e.stopImmediatePropagation();return;}if(panel.open&&!panel.contains(e.target as Node)&&!(e.target as Element).closest('.companion-avatar,.companion-text-entry'))dismiss();},true);
 window.addEventListener('keydown',e=>{if(panel.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dismiss(true);}},true);
 window.addEventListener('worldlet:companion-appearance',e=>{profile={...profile,...(e as CustomEvent).detail};if(panel.open)render();});
 return {open,toggle,entry:badge,feedback,journal:{toggle:()=>journal.isOpen?journal.close(true):void openJournal(),get isOpen(){return journal.isOpen;}},get openSection(){return journal.isOpen?'Journal':panel.open?panel.dataset.section||null:null;},get feedbackActive(){return panel.open&&panel.dataset.section==='Feedback';}};
}
