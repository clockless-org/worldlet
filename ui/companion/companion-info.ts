import {readCompanionProfile,type CompanionKnowledge,type CompanionProfile} from '../../contracts/companion.ts';
import {companionPersona} from '../../core/companion/index.ts';
import {node,uiIcon} from '../components/index.ts';
import {isDesktopCompanion,requireWorldSurface} from './world-surface.ts';
import {createCompanionFeedback} from './companion-feedback.ts';
import {createCompanionHistory} from './companion-history.ts';
import {createCompanionArtifacts} from './companion-artifacts.ts';
import {mountJournalBook} from './journal-book.ts';
import {createCompanionPhone} from './companion-phone.ts';
import {companionStill} from '../themes/index.ts';
import {createCompanionSettings} from './companion-settings.ts';
import {readFoxSkills,skillList,skillOffers,type FoxSkills} from './companion-skills.ts';
import {createFoxModelGuide} from './fox-model-guide.ts';
import {createPanelGuide} from './panel-guide.ts';
import {COMPANION_LOOK_PRESETS,COMPANION_SCARF_COLORS,companionLookIsClassic,companionLookKey,normalizeCompanionLook,recolorCompanionPixels,type CompanionLook} from '../../core/companion/index.ts';
import {ENERGY_LABEL,energySourceLabel,energyState,readEnergy,rechargeText,type Energy} from './world-energy.ts';

// What Fox can do, as things a person would actually say (owner feedback 2026-10-03: show real cases).
const ABILITIES:[icon:string,title:string,say:string,does:string][]=[
 ['mail','Mail','“What needs a reply today?”','Reads your inbox, finds what needs you and drafts replies for you to review.'],
 ['calendar','Calendar','“What’s coming up this week?”','Keeps Coming Up current and gets you ready before meetings.'],
 ['compass','Websites','“Find a short cooking video on YouTube.”','Works on a site in the background and shows each step. It asks before paying, sending or deleting.'],
 ['book','Remembers you','“Remember I’m vegetarian.”','Keeps what matters to you and uses it next time. You can view and correct it.'],
 ['clock','Routines','“Every morning at 8, tell me the weather and my first meeting.”','Runs on a schedule, also while Worldlet is closed once Hermes Agent runs as a service here.'],
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
 // Settings beside Fox lands on the Settings tab (owner Order 2026-10-07); the badge on Profile.
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
 // Settings finish in the panel; the World view lends the sample switch and host features.
 const settings=createCompanionSettings({call,host:()=>root.companionSettingsHost,history,close:()=>dismiss()});
 root.companionSettings=settings.element;
 // Charging (choosing a model source) happens on the Energy page, in place of its ways to charge.
 const charging=createPanelGuide({onClear:()=>{if(panel.open&&!busy)render();}});
 const modelGuide=createFoxModelGuide({call,view:charging.view,setup:undefined});
 let anchorFrame=0,anchorKey='';
 function anchorPanel(){
  if(!panel.open)return;
  const width=Math.min(1040,innerWidth-32),height=Math.min(660,innerHeight-32),left=(innerWidth-width)/2,top=(innerHeight-height)/2;
  const key=[left,top,height,width].join(':');
  if(key!==anchorKey){anchorKey=key;Object.assign(panel.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});}
  anchorFrame=requestAnimationFrame(anchorPanel);
 }
 // Feedback is last (owner feedback 2026-10-03); Applets moved to their areas.
 // The Journal left these tabs for a book of its own (owner request 2026-10-08); an old link to it opens the book.
 const tabs=['Profile','Energy','History','Mobile','Settings','Feedback'];
 let tab='Profile',model:any=null,energy:Energy|null=null,snapshot:any=null,profile:Partial<CompanionProfile>={},error='',busy=false,generation=0;
 const openGroups=new Set<string>(['user']);
 // Agents already on this computer (Codex, Claude Code, …).
 let localAgents:any[]=[];
 // The skills the World shows and Fox's offers to save a repeated task (companion-skills.ts).
 let skills:FoxSkills|null=null,skillNote='';
 async function loadSkills(){try{skills=readFoxSkills(await call('foxSkills',{operation:'list'}));}catch{skills=null;}if(panel.open&&!busy)render();}
 async function loadAgents(){
  try{const result=await call('agentHarness',{operation:'detect'});localAgents=Array.isArray(result?.agents)?result.agents.filter(a=>typeof a?.id==='string'&&typeof a?.title==='string'):[];}
  catch{localAgents=[];}
  if(panel.open&&!busy)render();
 }
 function button(label,action){const b=el('button','companion-info-action',label);b.type='button';b.onclick=action;return b;}
 async function run(action){if(busy)return;busy=true;error='';render();try{await action();}catch(e){error=e.message||'Please try again.';}finally{busy=false;render();}}
 function dismiss(focus=false){generation++;history.stop();modelGuide.stop();charging.element.hidden=true;charging.element.replaceChildren();cancelAnimationFrame(anchorFrame);void feedback.cancelVoice();panel.close();root.classList.remove('companion-info-open');badge.setAttribute('aria-expanded','false');if(focus)(badge.isConnected?badge:pet.querySelector('.companion-panel-button')||badge).focus();root.dispatchEvent(new Event('worldlet:companion-info-closed'));}
 window.addEventListener('worldlet:desktop-companion',event=>{if((event as CustomEvent).detail&&root.classList.contains('companion-info-open'))dismiss();syncEntry();});
 function render(){
  const close=button('×',()=>dismiss(true));close.className='companion-info-close';close.setAttribute('aria-label','Close companion panel');
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
  const body=el('div','companion-info-body'),nav=el('nav','companion-info-nav');nav.setAttribute('aria-label','Companion sections');nav.setAttribute('role','tablist');
  for(const section of tabs){const b=button(section,()=>selectTab(section));b.dataset.sectionLink=section;b.id='companion-tab-'+section;b.setAttribute('role','tab');b.setAttribute('aria-controls','companion-page-'+section);nav.append(b);}
  const main=el('div','companion-info-main');
  let grid=el('div','companion-info-grid');
  function card(icon,title,description,label?,action?){const c=el('section','companion-info-card'),symbol=el('span','companion-info-symbol');symbol.innerHTML=uiIcon(icon);const body=el('div');body.append(el('h4','',title),el('p','',description));c.append(symbol,body);if(label){const b=button(label,()=>run(action));b.disabled=busy;c.append(b);}grid.append(c);return c;}
  function energySection(){
   // The world's energy: which source powers the world, how much is left, and the ways to charge it.
   const section=el('section','companion-info-section companion-energy-page');section.dataset.section='Energy';section.append(el('h3','','Energy'),el('p','companion-energy-intro','Energy powers your whole world: Fox and every app.'));
   const state=energyState(energy),now=el('div','companion-energy-now');now.dataset.state=energy?state:'unknown';
   const meter=el('span','energy-cell');meter.append(el('span','energy-fill'));meter.style.setProperty('--energy',String(energy?.level??(state==='empty'?0:100)));
   const summary=el('div');
   summary.append(el('h4','',energy?ENERGY_LABEL[state]+(energy.level!==null?` · ${energy.level}%`:''):'Checking energy…'),el('p','',energy?'Charging from '+energySourceLabel(energy)+'.':''));
   const recharge=rechargeText(energy);if(recharge)summary.append(el('p','companion-info-note',recharge));
   if(energy?.level===null&&energy.source!=='none')summary.append(el('p','companion-info-note','Your provider keeps the balance, so the world shows charged until it says otherwise.'));
   now.append(meter,summary);section.append(now);
   // Connecting a source happens right here: the ways to charge give way to the steps.
   if(!charging.element.hidden){
    const back=button('Back to energy',()=>{modelGuide.stop();charging.view.setGuide(null);});back.classList.add('companion-energy-back');
    section.append(charging.element,back);return section;
   }
   section.append(el('h4','companion-energy-ways','Ways to charge'));
   grid=el('div','companion-info-grid');section.append(grid);
   const inUse=(source:string)=>energy?.source===source?' In use now.':'';
   const connect=async()=>{charging.element.hidden=false;render();await modelGuide.show();};
   // Worldlet provides no energy of its own (owner decision 2026-10-05): the world runs on the person's computer.
   if(energy?.source==='none')summary.append(el('p','companion-info-note companion-energy-needed','Your world runs on an AI on this computer. Sign in to Codex, add your own API key, or use an Agent on this computer from Settings.'));
   card('chat','Charge with ChatGPT','Use your ChatGPT plan through Codex on this computer.'+inUse('chatgpt'),'Connect',connect);
   card('plug','Bring your own energy','Use an API key from OpenAI, Anthropic and others.'+inUse('own'),'Connect',connect);
   // Agents on this computer, the connection's status and its fixes live in Settings › Model (owner request
   // 2026-10-06: one place to connect models and fix their problems); Energy only points there.
   const manage=button('Manage model connection',()=>void open('Settings','model'));manage.classList.add('companion-energy-manage');
   section.append(el('p','companion-info-note',localAgents.length?'Use an Agent on this computer, check the connection or fix a problem in Settings.':'Check the connection or fix a problem in Settings.'),manage);
   if(energy?.name)section.append(el('p','companion-info-note','Details: '+energy.name));
   return section;
  }
  function abilitiesSection(){
   const section=el('div','companion-abilities');section.setAttribute('aria-label','What '+(profile.name||getName()||'Fox')+' can do');
   section.append(el('h3','','What '+(profile.name||getName()||'Fox')+' can do'),el('p','companion-energy-intro','Just ask, in your own words. A few things people say:'));
   grid=el('div','companion-info-grid companion-abilities-grid');section.append(grid);
   for(const [icon,title,say,does] of ABILITIES){const c=card(icon,title,does);c.querySelector('h4').after(el('q','companion-ability-say',say));}
   const memory=card('book','Your memory','See and correct what '+(profile.name||getName()||'Fox')+' remembers about you.','Open',async()=>{dismiss();window.dispatchEvent(new Event('worldlet:memory-manager'));});
   memory.classList.add('companion-ability-memory');
   return section;
  }
  page.append(side,abilitiesSection());
  main.append(page,energySection(),history.element,phone.element,settings.element,feedback.element);
  const notice=el('p','companion-info-note',error);notice.setAttribute('role','status');notice.hidden=!error;body.append(nav,main,notice);panel.replaceChildren(body,close);applyTab();
 }
 function applyTab(){
  for(const section of panel.querySelectorAll('.companion-info-main>[data-section]')){section.hidden=section.dataset.section!==tab;section.id='companion-page-'+section.dataset.section;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','companion-tab-'+section.dataset.section);section.tabIndex=0;}
  for(const b of panel.querySelectorAll('[role=tab]')){const selected=b.dataset.sectionLink===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  panel.dataset.section=tab;
 }
 function selectTab(next,focus=false){if(next===tab)return;tab=next;if(next!=='Feedback')void feedback.cancelVoice();if(next==='Settings')settings.open();applyTab();if(focus)panel.querySelector('[aria-selected=true]')?.focus();}
 panel.addEventListener('keydown',e=>{if(!(e.target as Element).closest('[role=tab]'))return;const index=tabs.indexOf(tab);let next;if(e.key==='ArrowRight')next=tabs[(index+1)%tabs.length];if(e.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];if(e.key==='Home')next=tabs[0];if(e.key==='End')next=tabs.at(-1);if(next){e.preventDefault();selectTab(next,true);}});
 async function open(section='Profile',setting?:string){if(root.dataset.onboardingLocked==='true'&&root.dataset.onboardingAddApplet!=='true')return;if(section==='Journal'||section==='Artifacts'){await openJournal();return;}journal.close();delete root.dataset.onboardingFinish;tab=tabs.includes(section)?section:['iPhone','Phone'].includes(section)?'Mobile':'Profile';history.start();void phone.refresh();void loadAgents();void loadSkills();if(tab==='Settings')settings.open(setting);if(panel.open){render();return;}const ticket=++generation;render();panel.show();anchorKey='';cancelAnimationFrame(anchorFrame);anchorPanel();root.classList.add('companion-info-open');badge.setAttribute('aria-expanded','true');root.dispatchEvent(new Event('worldlet:companion-info-opened'));const results=await Promise.allSettled([call('modelStatus'),call('snapshot'),call('companionProfile').then(readCompanionProfile),readEnergy(call)]);if(!panel.open||ticket!==generation)return;model=results[0].status==='fulfilled'?results[0].value:null;snapshot=results[1].status==='fulfilled'?results[1].value:null;profile=results[2].status==='fulfilled'?results[2].value:profile;energy=results[3].status==='fulfilled'?results[3].value:energy;if(results.some(r=>r.status==='rejected'))error='Some status information is unavailable. Try reopening the panel.';render();}
 // A new model source charges the world: read the energy again.
 for(const name of ['worldlet:model-changed','worldlet:model-refresh'])window.addEventListener(name,()=>{if(!panel.open)return;void readEnergy(call).then(value=>{energy=value;if(panel.open&&!busy)render();}).catch(()=>{});});
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
