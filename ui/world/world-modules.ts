import {applyAppsMatters} from './apps-matters.ts';
import {WORLD_PRESETS} from './world-presets.ts';

// Curated capability catalog; connections and content determine readiness, never a click.
export const WORLD_MODULES = [
 ['today','home','Today','calendar',['google-calendar'],'scene','Your day, at a glance','place-calendar'],
 ['inbox','home','Inbox','mail',['gmail'],'panel','Messages that need your attention','place-home'],
 ['household','home','Household','house',[],'scene','Plans and things to take care of together','place-family'],
 ['journal','home','Journal','journal',[],'panel','A little space to remember your day','place-journal'],
 ['projects','work','Projects','project',['github','notion'],'scene','From next step to finished work','place-project'],
 ['code','work','Code Studio','code',['github'],'panel','Repositories, builds and coding tasks','place-factory'],
 ['documents','work','Documents','document',['notion'],'panel','Writing, drafts and documents','place-archive'],
 ['meetings','work','Meetings','sound',['google-calendar'],'panel','Prepare, discuss and follow through','place-meeting'],
 ['notes','work','Notes','notes',['notion'],'panel','Ideas with their original sources','place-notes'],
 ['reading','work','Reading','book',[],'scene','Your reading shelf and current reads','place-library'],
 ['research','work','Research','research',[],'scene','Questions, sources and discoveries','place-vision'],
 ['browser','people','Browser','browser',[],'panel','Browse X and keep what matters','place-browser'],
 ['spending','money','Spending','coins',[],'scene','Understand where your money goes','place-expense'],
 ['budget','money','Budget','budget',[],'scene','Make room for what matters','place-finance'],
 ['bills','money','Bills','receipt',[],'panel','Bills, renewals and due dates','place-bills'],
 ['assets','money','Assets','assets',[],'scene','A place for your asset records','place-assets'],
 ['activity','health','Activity','activity',[],'scene','Movement, goals and small wins','place-health'],
 ['sleep','health','Sleep','sleep',[],'scene','Rest and your daily rhythm','place-sleep'],
 ['care','health','Care','care',[],'panel','Appointments and health records','place-care'],
 ['trip','money','Trip Planner','map',[],'scene','Bring the next journey into view','place-rocket'],
 ['bookings','money','Bookings','case',['gmail'],'panel','Flights, stays and reservations','place-bookings'],
 ['travel-journal','money','Travel Journal','globe',[],'scene','Places you have been, stories to keep','place-travel-journal'],
 ['relationships','home','Relationships','people',[],'scene','The people in your life','place-contacts'],
 ['follow-ups','work','Follow-ups','followup',['gmail'],'panel','Conversations worth continuing','place-support'],
 ['gatherings','home','Gatherings','gathering',['google-calendar'],'scene','Make time to get together','place-cafe']
].map(([key,region,title,shape,providers,presentation,description,roomId])=>({id:'module-'+key,key,region,title,shape,providers,presentation,description,roomId}));

function chooseModule(page,oldRoom){
 if(page.webApp) return 'browser';
 if(page.objectKind==='calendar'&&page.pending)return 'today';
 const known={'sample-rest':'sleep','sample-evening':'sleep','sample-cabin-memory':'travel-journal','sample-car-service':'assets','sample-data':'assets'};if(known[page.id])return known[page.id];
 if(page.moduleKey&&WORLD_MODULES.some(m=>m.key===page.moduleKey))return page.moduleKey;
 const text=page.title||'';
 if(/journal|reflection/i.test(text))return /trip|travel|cabin|camping/i.test(text)?'travel-journal':'journal';
 if(oldRoom?.theme==='library'&&/notes?|template|information design/i.test(text))return 'notes';
 if(/sleep|rest routine/i.test(text))return 'sleep';
 if(/appointment|health record|checkup/i.test(text))return 'care';
 if(/subscription|renewal|bill\b/i.test(text))return 'bills';
 if(/asset|investment|portfolio/i.test(text))return 'assets';
 if(/flight|booking|stay|reservation|packing/i.test(text)&&['rocket','travel'].includes(oldRoom?.theme))return 'bookings';
 const mapped={home:'inbox',calendar:'today',family:'household',growth:'household',factory:'code',studio:'projects',project:'projects',archive:'documents',data:'documents',meeting:'meetings',library:'reading',vision:'research',finance:'budget',expense:'spending',health:'activity',rocket:'trip',contacts:'relationships',support:'follow-ups',cafe:'gatherings',news:'browser'};
 return mapped[oldRoom?.theme]||'notes';
}
export function moduleStatus(module,pages,sample=false,connections=[]){
 const count=module.children.filter(id=>pages.has(id)).length;
 if(sample&&count)return {state:'sample',label:count+' records',count};
 const links=connections.filter(c=>module.providers.includes(c.provider));
 if(links.some(c=>c.status==='sync_error'))return {state:'error',label:'Sync needs attention',count};
 if(links.some(c=>c.status==='pending'))return {state:'pending',label:'Connection pending',count};
 if(count)return {state:'ready',label:count+' local '+(count===1?'record':'records'),count};
 if(links.some(c=>c.status==='connected'))return {state:'connected',label:'Connected · No records yet',count};
 return {state:'disconnected',label:module.providers.length?'Not connected':'Not set up',count};
}
export function applyModuleWorld(world){
 if(world.moduleCatalog)return applyAppsMatters(world);
 const oldRooms=world.spaces||[],oldPages=new Map(world.pages.map(p=>[p.id,p]));
 const modules=WORLD_MODULES.map(m=>({...m,children:[]}));
 const rootIds=new Set(world.roots);
 for(const p of world.pages){
  if(rootIds.has(p.id))continue;
  const old=oldRooms.find(r=>r.children.includes(p.id));
  const key=chooseModule(p,old);
  modules.find(m=>m.key===key).children.push(p.id);
 }
 world.moduleCatalog=true;world.viewSchema='world-region-module-v1';
 world.spaces=modules.map(m=>{
  const preset=WORLD_PRESETS.find(p=>p.id===m.region);
  const old=oldRooms.find(r=>r.id===m.roomId);
  return {...m,id:m.roomId,moduleId:m.id,moduleKey:m.key,theme:preset.theme,title:m.title,buildingId:'building-'+m.region,areaId:'area-default',functionName:m.title,summary:m.description,objectKind:m.shape,...(m.key==='trip'&&old?.trip?{trip:old.trip,stayExperiment:old.stayExperiment}:{}),status:moduleStatus(m,oldPages,!!world.sample,world.moduleConnections)};
 });
 world.buildings=WORLD_PRESETS.map(p=>({id:'building-'+p.id,title:p.title,emoji:p.emoji||'',theme:p.theme,region:p.id,color:p.color,position:p.position,summary:p.description,areaId:'area-default',rooms:world.spaces.filter(s=>s.region===p.id).map(s=>s.id),unbuilt:!world.spaces.some(s=>s.region===p.id&&['ready','sample','connected'].includes(s.status.state))}));
 world.areas=[{id:'area-default',title:'My life & work',default:true,buildings:world.buildings.map(b=>b.id),places:world.spaces.map(s=>s.id)}];
 world.viewObjects=world.spaces.map(s=>({id:s.moduleId,title:s.title,roomId:s.id,kind:'module',moduleKey:s.moduleKey,pageIds:s.children,summary:s.description}));
 if(world.scene)world.scene.objects=[...world.buildings.map(b=>({id:b.id,parent:'world',template:b.theme,position:b.position,state:b.unbuilt?'inactive':'ready'})),...world.spaces.map(s=>({id:s.moduleId,parent:s.buildingId,template:s.shape,state:s.status.state,contextRefs:s.children}))];
 return applyAppsMatters(world);
}
