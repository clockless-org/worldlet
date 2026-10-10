import type {World} from '../../contracts/world.ts';
import {WORLD_PRESETS} from './world-presets.ts';
import {appletStatus} from '../../core/applets/index.ts';

import {APP_DEFINITIONS,WORLD_APPS} from '../../core/applets/index.ts';
export {WORLD_APPS};

// The sample's Matters are declared beside its records, in sample-persona.json:
// every note names the Matter it belongs to, and the Matter carries its own
// region, shape and description. Nothing here guesses from a title.
function sampleMatterFor(world,p){
 const def=(world.sampleMatters||[]).find(m=>m.key===p.matter);
 if(!def)throw Error('Sample record without a Matter: '+p.id);
 return def;
}
export function applyAppsMatters(world: World){
 if(world.matterCatalog)return world;
 const old=world.spaces,roots=new Set(world.roots),records=world.pages.filter(p=>!roots.has(p.id)&&!p.webApp);
 // The catalog's Applets, then those made at run time (an ongoing thing the person kept).
 const catalog=[...WORLD_APPS,...(world.dynamicApplets||[]).filter(a=>a?.id&&!WORLD_APPS.some(b=>b.id===a.id))];
 const matterRows=new Map(),aliases={},appOriginals=new Map(catalog.map(a=>[a.id,[]]));
 const byId=new Map(records.map(p=>[p.id,p])),owners=new Map(),topicOwners=new Map();
 // In the sample, an attention item belongs to the Applet that published it, as it
 // would in a real world; the notes it was read from stay with their Matter.
 if(world.sample)for(const p of records){if(!p.worldItemId)continue;const owner=APP_DEFINITIONS.find(a=>a.key===p.sourceProvider);if(owner)owners.set(p.id,owner);}
 else for(const p of records){
  const owner=p.sourceId&&APP_DEFINITIONS.find(a=>a.key===p.sourceProvider||a.connection.provider===p.sourceProvider);
  if(!owner)continue;
  owners.set(p.id,owner);
  // Topics remain searchable context, not automatically generated world objects.
  const seen=new Set();let parent=byId.get(p.parent);
  while(parent&&!seen.has(parent.id)){seen.add(parent.id);topicOwners.set(parent.id,topicOwners.get(parent.id)||owner);parent=byId.get(parent.parent);}
 }
 for(const p of records){
  // Both raw and organized connector records belong to their Applet.
  // Keep the pages searchable/readable and redirect previously saved matter links.
  const owner=owners.get(p.id)||topicOwners.get(p.id);
  if(owner){
   if(!appOriginals.has(owner.id)){delete p.appletId;delete p.matterId;delete p.matterTitle;continue;}
   if(owners.has(p.id))appOriginals.get(owner.id).push(p.id);
   p.appletId=owner.id;aliases['matter-'+p.id]=owner.id;aliases['place-matter-'+p.id]='place-'+owner.id;
   if(p.matterId){aliases[p.matterId]??=owner.id;aliases['place-'+p.matterId]??='place-'+owner.id;}
   delete p.matterId;delete p.matterTitle;continue;
  }
  const source=old.find(r=>r.children.includes(p.id));let def;
  if(world.sample)def=sampleMatterFor(world,p);
  else {
   // Respect structured topic ownership; connector originals were assigned above.
   // A mail source is not another mailbox: the Gmail App owns the receiving device.
   const parent=world.pages.find(v=>v.id===p.parent&&!roots.has(v.id));
   const key=p.matterId||parent?.id||p.id;
   def={key,title:parent?.title||p.title,region:source?.region||'home',shape:source?.shape==='mail'?'document':source?.shape||'document',moduleKey:source?.moduleKey||'journal',theme:source?.theme||'home',description:'Your related records, together in one place.'};
  }
  const id='matter-'+def.key;let matter=matterRows.get(id);
  if(!matter){matter={...def,id:'place-'+id,moduleId:id,entity:'matter' as const,children:[],providers:[],presentation:'scene',buildingId:'building-'+def.region,areaId:'area-default',summary:def.description,objectKind:def.shape};matterRows.set(id,matter);}
  matter.children.push(p.id);p.matterId=id;p.matterTitle=matter.title;
  if(source){aliases[source.id]??=matter.id;aliases[source.moduleId]??=id;}
 }
 const matters=[...matterRows.values()];
 if(world.sample){
  // The data declares the order; the world keeps it, so the first Matter listed for a
  // region takes that region's first authored slot.
  const order=m=>(world.sampleMatters||[]).findIndex(d=>d.key===m.key);
  matters.sort((a,b)=>order(a)-order(b));
  for(const m of matters)m.slot=(world.sampleMatters||[]).filter(d=>d.region===m.region).findIndex(d=>d.key===m.key);
 }
 for(const m of matters){m.status={state:world.sample?'sample':'ready',label:m.children.length+' records',count:m.children.length};}
 const trip=old.find(r=>r.trip);const japan=matterRows.get('matter-japan');if(japan&&trip)japan.trip=trip.trip;
 // A sample Applet stands in for a connected one: the notes that carry its name are
 // its records, its items are what it published, and its status says "Sample" so the
 // device lights up without a single account being claimed.
 const sampleLinks=[];
 // An Applet Fox made for a moment (core/artifacts/README.md) is in the World from the moment it is made, so it is
 // never waiting to be unlocked or hidden, and it leaves when its moment is over.
 // So is a website the person made an Applet of from the Browser (core/applets/site-applet.ts).
 const moments=catalog.filter(a=>a.moment||a.site).map(a=>a.id);
 if(moments.length&&world.unlockedApplets)world.unlockedApplets=[...new Set([...world.unlockedApplets,...moments])];
 if(moments.length&&world.hiddenApplets)world.hiddenApplets=world.hiddenApplets.filter(id=>!moments.includes(id));
 const apps=catalog.map(a=>{
  const children=[...appOriginals.get(a.id),...world.pages.filter(p=>p.webApp?.kind===a.key).map(p=>p.id)];
  const sampleRecords=world.sample?records.filter(p=>p.applet===a.key).map(p=>p.id):[];
  if(world.sample&&(children.length||sampleRecords.length))sampleLinks.push({provider:a.provider||a.key,sample:true,connected:true,running:false,failed:false,needsAttention:false,savedItemCount:children.filter(id=>byId.get(id)?.worldItemId).length,records:sampleRecords.map(id=>({id,title:byId.get(id).title}))});
  // A moment Applet comes into the World as if just used, so it stands among the area's recent places.
  return {...a,...(a.moment?.createdAt?{arrivedAt:a.moment.createdAt*1000}:{}),id:'place-'+a.id,moduleId:a.id,entity:'app' as const,moduleKey:a.key,children,...(world.sample?{sampleRecords}:{}),providers:a.provider?[a.provider]:[],presentation:'panel',buildingId:a.placement?.kind==='world'?null:'building-'+a.region,areaId:'area-default',theme:WORLD_PRESETS.find(r=>r.id===a.region)?.theme||'home',summary:a.description,objectKind:a.shape,status:appletStatus(a,world.sample?sampleLinks:world.moduleConnections)};
 });
 if(world.sample)world.moduleConnections=sampleLinks;
 aliases['object-japan']='matter-japan';aliases['module-trip']='matter-japan';aliases['place-rocket']=japan?.id||'building-travel';aliases['module-browser']='app-x';aliases['place-browser']='place-app-x';
 world.matterCatalog=true;world.viewSchema='world-region-matter-v1';
 // Dev merged into Work; saved links and stored region IDs still resolve.
 aliases['building-development']='building-work';aliases['development']='work';
 world.navigationAliases=aliases;
 world.spaces=[...matters,...apps];world.matters=matters;world.apps=apps;
 for(const b of world.buildings){b.rooms=world.spaces.filter(r=>r.buildingId===b.id).map(r=>r.id);b.unbuilt=!world.spaces.some(r=>r.buildingId===b.id&&['sample','ready','connected'].includes(r.status.state));}
 world.areas[0].places=world.spaces.map(s=>s.id);
 world.viewObjects=world.spaces.map(s=>({id:s.moduleId,title:s.title,roomId:s.id,kind:'module',entity:s.entity,pageIds:s.children,summary:s.description}));
 if(world.scene)world.scene.objects=world.spaces.map(s=>({id:s.moduleId,parent:s.buildingId||s.areaId,entity:s.entity,template:s.shape,state:s.status.state,contextRefs:s.children}));
 return world;
}
