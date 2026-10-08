import type {World,WorldBuilding} from '../../contracts/world.ts';
// View structure for the fictional sample. This is declarative data, not generated code.
export function applySampleHierarchy(world: World){
 const buildings: WorldBuilding[]=[
  {id:'building-home',title:'Home',theme:'home',position:[-12,0,7],color:'#b98063',summary:'Make room for daily life and your next adventure'},
  {id:'building-library',title:'Library',theme:'library',position:[-17,0,-16],color:'#779889',summary:'Keep knowledge, documents, and data close by'},
  {id:'building-work',title:'Workshop',theme:'factory',position:[7,0,-22],color:'#7198a3',summary:'From ideas and projects to work ready to share'},
  {id:'building-finance',title:'Finance lodge',theme:'finance',position:[25,0,-4],color:'#b59762',summary:'Keep track of budgets and decisions'},
  {id:'building-health',title:'Wellness garden',theme:'health',position:[18,0,18],color:'#8fa777',summary:'Make room for movement and rest'},
  {id:'building-community',title:'Gathering place',theme:'cafe',position:[-3,0,29],color:'#b68b8c',summary:'Collaborate, follow up, and stay in touch'}
 ];
 const rows=[
  ['home','Mailroom','home','Email','Mail tray','sample-mail','Two moving quotes · Choose one','mail'],
  ['calendar','Calendar room','home','Calendar','Calendar desk','sample-agenda','3 plans for today','calendar'],
  ['family','Planning room','home','To Do','Task board','sample-family-1','School forms · Review needed','task'],
  ['rocket','Travel room','home','Travel Planner','Japan trip diorama','object-japan','12 days to go · Choose a Kyoto stay','map'],
  ['library','Reading room','library','Notes / Knowledge','Books & notes','sample-library-1','Make time to read this week','book'],
  ['archive','Document room','library','Documents / Slides','Writing desk','sample-document','Proposal v2 · In review','document'],
  ['data','Data room','library','Sheets / Database','Data desk','sample-data','3 items · 1 to buy','sheet'],
  ['studio','Design studio','work','Design / Content','Easel','sample-studio-1','World prototype · Awaiting feedback','canvas'],
  ['project','Project room','work','Project Management','Project progress model','sample-project','Release plan · 1 blocker','task'],
  ['factory','Code studio','work','Code / CI','Production line','sample-factory-3','Sync in review · App ready to release','monitor'],
  ['finance','Household budget','finance','Personal Finance','Budget tray','sample-finance-1','Moving budget ¥8,000 · Unallocated','coins'],
  ['expense','Team accounts','finance','Expenses / Invoices','Receipt folder','sample-expense','2 expenses · Awaiting approval','coins'],
  ['health','Movement & rest','health','Health / Habits','Walking trail','sample-health-1','Walks this week · 3 / 5','plant'],
  ['cafe','Conversation room','community','Team Chat','Discussion table','sample-chat','Launch discussion · Decision needed','people'],
  ['meeting','Meeting room','community','Meetings','Meeting recorder','sample-meeting','Design review · 2 action items','sound'],
  ['contacts','Connections room','community','Contacts / CRM','Contact book','sample-contact','Alex Lin · Follow up next week','people'],
  ['support','Support room','community','Support / Tickets','Support desk','sample-support','Import failed · Awaiting reproduction','ticket']
 ];
 const additions=[
  ['sample-document','World experience proposal','## Proposal v2\nBring mail, calendars, and travel into a world of your own.\n\n## In review\n- [x] Scene hierarchy\n- [ ] Onboarding copy\n\n## Slides\n1. Connect sources\n2. Step into your world\n3. Work directly with objects'],
  ['sample-data','Studio equipment','## Equipment inventory\n| Equipment | Quantity | Status |\n| --- | --- | --- |\n| Monitor | 2 | Owned |\n| Microphone | 1 | Owned |\n| Desk lamp | 1 | To buy |'],
  ['sample-project','World release plan','## Project progress\n- [x] Define the experience\n- [x] Build the scene prototype\n- [ ] User testing (blocked: awaiting feedback)\n- [ ] Prepare release notes\n\nNext: organize feedback from testers.'],
  ['sample-expense','September team expenses','## Receipts to approve\n| Project | Amount | Status |\n| --- | --- | --- |\n| Meeting materials | ¥120 | Pending |\n| Printing | ¥80 | Pending |\n\nTotal: ¥200. No real payments or approvals.'],
  ['sample-chat','Launch timing','## Discussion highlights\nAlex: finish the onboarding checks first.\nJamie: we can review it together on Friday.\n\n## To decide\nLaunch on Friday, or leave one more day for fixes?\n\nKeep launch discussions together here, across your chat apps.'],
  ['sample-meeting','Design review notes','## Decisions\nOrganize the world around what matters to the user. Hide the area layer by default.\n\n## Action items\n- [ ] Check that status is readable within rooms\n- [ ] Test direct navigation through search'],
  ['sample-contact','Alex Lin · Follow-up','## Contact profile\nFictional contact: Alex Lin, design partner.\n\nLast conversation: prototype feedback.\nNext: ask for first-round feedback next week.\n\nRelated: design review notes and world experience proposal.'],
  ['sample-support','Import issue report','## Ticket · Needs reproduction\nA tester reported a failure when importing a Markdown file.\n\n- [x] Record the issue\n- [ ] Reproduce with a sample file\n- [ ] Share the result after the fix\n\nNo real customers have been contacted.']
 ];
 for(const [id,title,body]of additions)world.pages.push({id,title,kind:'page',parent:'sample-root',children:[],path:id+'.md',paths:[id+'.md'],markdown:body+'\n\nFictional sample for exploration only.',text:title+'\n'+body});
 const old=new Map(world.spaces.map(s=>[s.theme,s]));
 const assigned=new Set();
 const ownership={home:['sample-mail'],calendar:['sample-agenda','sample-calendar-1'],family:['sample-family-1','sample-home-1','sample-home-3'],rocket:['sample-japan-map','sample-japan-calendar','sample-japan-flight','sample-japan-booking','sample-rocket-1','sample-surprise'],library:['sample-library-1','sample-library-2','sample-studio-2','sample-vision-1'],archive:['sample-document','sample-archive-1'],finance:['sample-finance-1','sample-home-2'],studio:['sample-studio-1'],cafe:['sample-chat','sample-cafe-1']};
 world.spaces=rows.map(([theme,title,building,functionName,prop,example,status,objectKind])=>{
  const existing=old.get(theme),children=(ownership[theme]||existing?.children||[]).filter(id=>!assigned.has(id));
  if(example!=='object-japan'&&!children.includes(example))children.unshift(example);
  children.forEach(id=>assigned.add(id));
  for(const id of children){const p=world.pages.find(p=>p.id===id);if(p){p.objectKind=id===example||theme==='factory'?objectKind:p.objectKind||'book';p.spatialStatus=p.projectStatus||(id===example?status:'Ready to view');p.provenance||=[{provider:({home:'Gmail',calendar:'Calendar',factory:'GitHub'})[theme]||'Notion',label:'Fictional sample source'}];}}
  return {...existing,id:'place-'+theme,theme,title,children,buildingId:'building-'+building,areaId:'area-default',functionName,prop,example,summary:status,objectKind};
 });
 // Preserve every existing sample record, even those from retired scene themes.
 for(const p of world.pages)if(p.id!=='sample-root'&&!assigned.has(p.id)){
  const room=world.spaces.find(s=>s.theme===(/vision|rocket|surprise/.test(p.id)?'rocket':/home-2/.test(p.id)?'finance':'library'));
  room.children.push(p.id);assigned.add(p.id);p.objectKind||='book';
 }
 for(const b of buildings){b.areaId='area-default';b.rooms=world.spaces.filter(s=>s.buildingId===b.id).map(s=>s.id);}
 world.buildings=buildings;
 world.areas=[{id:'area-default',title:'My life & work',default:true,buildings:buildings.map(b=>b.id),places:world.spaces.map(s=>s.id)}];
 const budget=world.pages.find(p=>p.id==='sample-finance-1');budget.markdown='## Moving budget · Fictional sample\nTotal budget: ¥8,000, not yet allocated.\n\n| Project | Amount | Status |\n| --- | --- | --- |\n| Moving | ¥1,800 / ¥2,100 | Choose a plan |\n| Furniture | To estimate | To compare |\n| Reserve | To decide | Unallocated |';budget.text=budget.title+'\n'+budget.markdown;
 const health=world.pages.find(p=>p.id==='sample-health-1');health.markdown='## This week in walks · Fictional sample\nWeekly goal: 5 walks. Completed: 3.\n\n- [x] Monday · 20 minutes\n- [x] Wednesday · 25 minutes\n- [x] Friday · 20 minutes\n- [ ] Take a weekend walk\n- [ ] Make time for another break\n\nThese are fixed sample records, not real health data.';health.text=health.title+'\n'+health.markdown;
 const data=world.pages.find(p=>p.id==='sample-data');data.table={columns:['Equipment','Quantity','Status'],rows:[['Monitor','2','Owned'],['Microphone','1','Owned'],['Desk lamp','1','To buy']]};data.markdown='## Equipment inventory\nFictional sample: a filterable table, not connected to a purchasing system.';
 world.viewSchema='world-area-building-room-object-v1';
 world.viewObjects=[{id:'object-japan',title:'Japan trip',roomId:'place-rocket',kind:'trip',pageIds:Object.values(old.get('rocket').trip),summary:'Tokyo → Kyoto → Osaka · Choose a Kyoto stay'}];
 const guide=world.pages.find(p=>p.id==='sample-home-3');guide.markdown='## Five spatial layers\nWorld → Area (hidden by default) → Place → Room / scene → Object.\n\nPlaces and rooms are long-lived. A Japan trip is a diorama inside them. Explore the route and preparation status, then select a flight or stay to open its details. The details HUD is not another spatial layer.\n\nPress Esc to go back, or search for “Japan trip” or “Code studio”. All content is fictional.';guide.text=guide.title+'\n'+guide.markdown;
 world.pages[0].children=world.pages.filter(p=>p.id!=='sample-root').map(p=>p.id);world.coverage.pages=world.pages.length-1;
 return openLandscape(world);
}

export function roomObjects(room: any,pages: Map<string,any>,composites: any[]=[]){
 const groups=composites.filter(o=>o.roomId===room.id&&(o.kind==='module'||o.pageIds.some(id=>pages.has(id))));
 const grouped=new Set(groups.flatMap(o=>o.pageIds));
 if(groups.some(o=>o.kind==='module'))return groups.map(o=>({...o,pageIds:room.children.filter(id=>pages.has(id))}));
 return [...groups,...room.children.filter(id=>pages.has(id)&&!grouped.has(id)).map(id=>({id,title:pages.get(id).title,roomId:room.id,kind:pages.get(id).objectKind||room.objectKind||'book',pageIds:[id],summary:pages.get(id).modifiedLocally?'Edited · View content':pages.get(id).projectStatus||pages.get(id).spatialStatus||'Ready to view'}))];
}

// A stable place can be an outdoor setting, not necessarily an enclosed house.
function openLandscape(world: World){
 const extra: WorldBuilding[]=[
  {id:'building-memory',title:'Memory garden',theme:'calendar',position:[-24,0,-6],color:'#9aaa80',rooms:['place-calendar']},
  {id:'building-travel',title:'Travel camp',theme:'rocket',position:[32,0,19],color:'#c69e77',rooms:['place-rocket']},
  {id:'building-growth',title:'Family nook',theme:'family',position:[-18,0,22],color:'#c8a287',rooms:['place-growth']},
  {id:'building-vision',title:'Lookout',theme:'vision',position:[-1,0,-35],color:'#88a5a1',rooms:['place-vision']}
 ];
 world.spaces.push({id:'place-growth',theme:'family',title:'Family & growth',buildingId:'building-growth',areaId:'area-default',functionName:'Family',prop:'Family journal',example:'sample-family-1',summary:'School preparations & family milestones',objectKind:'book',children:['sample-family-1']});
 world.spaces.push({id:'place-vision',theme:'vision',title:'Ideas & inspiration',buildingId:'building-vision',areaId:'area-default',functionName:'Ideas / Wishes',prop:'Wish book',example:'sample-vision-1',summary:'Little things to try',objectKind:'book',children:['sample-vision-1']});
 for(const room of world.spaces){if(room.id!=='place-growth')room.children=room.children.filter(id=>id!=='sample-family-1');if(room.id!=='place-vision')room.children=room.children.filter(id=>id!=='sample-vision-1');}
 const family=world.spaces.find(r=>r.id==='place-family');family.example='sample-home-1';family.summary='Moving preparations & daily plans';
 for(const b of extra){b.areaId='area-default';for(const id of b.rooms)world.spaces.find(r=>r.id===id).buildingId=b.id;}
 const positions={home:[-12,0,5],library:[-10,0,-19],factory:[14,0,-20],finance:[27,0,-2],health:[17,0,18],cafe:[-1,0,23]};
 for(const b of world.buildings){b.rooms=world.spaces.filter(r=>r.buildingId===b.id).map(r=>r.id);b.position=positions[b.theme]||b.position;}
 world.buildings.push(...extra);world.areas[0].buildings=world.buildings.map(b=>b.id);world.areas[0].places=world.spaces.map(r=>r.id);
 return world;
}
