import type {World} from '../../contracts/world.ts';
import {connectionLive} from '../../core/applets/index.ts';
import {WORLD_LAYOUT} from './world-layout.ts';
// Stable places are organized by life domain. Sources are cross-domain inputs.
export const WORLD_PRESETS = [
 {id:'home',emoji:'\u{1F3E1}',theme:'home',position:[0,0,-4],color:'#b98063',room:'Personal room',description:'Personal routines, household plans, family, journal, photos and the browser',themes:['home','family','calendar','cafe','rocket']},
 // Work absorbed the former Dev region and, on 2026-10-08, Create: shipping software and making documents are work.
 {id:'work',emoji:'\u{1F6E0}\u{FE0F}',theme:'studio',position:[18,0,-20],color:'#7198a3',room:'Project studio',description:'Team projects, clients, meetings, code, notes, documents, design and media production',themes:['studio','factory','library','archive','vision']},
 // The `library` ID is Social since 2026-10-08 (Create merged into Work); the ID stays so saved layouts keep their place.
 {id:'library',emoji:'\u{1F4AC}',theme:'library',position:[-16,0,-19],color:'#779889',room:'Gathering room',description:'Social networks, communities and messaging',themes:[]},
 {id:'money',emoji:'\u{1F4B0}',theme:'finance',position:[26,0,0],color:'#b59762',room:'Planning desk',description:'Budgets, bills, shopping, maps and travel',themes:['finance']},
 {id:'health',emoji:'\u{2764}\u{FE0F}',theme:'health',position:[17,0,20],color:'#8fa777',room:'Wellness garden',description:'Movement, rest and health records',themes:['health']},
 // The `travel` ID is Entertainment since 2026-10-08 (formerly Explore).
 {id:'travel',emoji:'\u{1F3AC}',theme:'rocket',position:[-16,0,20],color:'#c69e77',room:'Screening room',description:'Video, music, live streams and short video',themes:[]},
 // Keep the persisted region ID and old navigation links stable. Relationships belong at Home.
 {id:'people',emoji:'\u{1F9ED}',theme:'news',position:[0,0,31],color:'#b68b8c',room:'Reading court',description:'A place to wander, watch and discover',themes:['news']}
].map(p=>({...p,title:WORLD_LAYOUT.regions[p.id].title}));
export const presetForTheme=theme=>WORLD_PRESETS.find(p=>p.themes.includes(theme))||WORLD_PRESETS[0];

export function applyPersonalWorld(world: World,state: any){
 const sources=(state.sources||[]).filter(s=>s.enabled),connections=(state.connections||[]).filter(connectionLive),homeReady=sources.length>0||connections.length>0||(state.onboarding?.establishedRegions||[]).includes('home');
 const sourceById=new Map();for(const source of sources)if(!sourceById.has(source.id))sourceById.set(source.id,source);
 const originalBySource=new Map();for(const page of world.pages)if(page.sourceId&&!page.intentId&&!originalBySource.has(page.sourceId))originalBySource.set(page.sourceId,page);
 const selected=new Set([...(state.onboarding?.establishedRegions||[]),...(homeReady?['home',...(state.onboarding?.presets||[])]:[])]);
 const children=new Map(WORLD_PRESETS.map(p=>[p.id,[]]));
 for(const room of world.spaces){const preset=presetForTheme(room.theme);for(const id of room.children)children.get(preset.id).push(id);if(room.children.length)selected.add(preset.id);}
 // Unsummarized originals remain readable. Never infer a domain from an app name.
 for(const source of sources){
  if(originalBySource.has(source.id))continue;
  const preset=WORLD_PRESETS.find(p=>p.id===source.preset)||WORLD_PRESETS[0];selected.add(preset.id);
  const id='source-'+source.id,body=source.excerpt||'Your original is saved on this device. Open the original to read it.';
  children.get(preset.id).push(id);
  world.pages.push({id,title:source.title,parent:world.roots[0],children:[],paths:[id+'.md'],path:id+'.md',kind:'page',text:body,markdown:body,moduleKey:source.moduleKey,sourceId:source.id,sourceRevision:source.revision,revision:source.revision,pending:true,knowledge:true,objectKind:({'gmail':'mail','google-calendar':'calendar','github':'monitor'})[source.origin]||'book',spatialStatus:'Original · Not yet organized'});
  originalBySource.set(source.id,world.pages.at(-1));
 }
 // A saved source can be relevant to several regions without duplicating the original.
 for(const [region,ids] of Object.entries<string[]>(state.onboarding?.regionSources||{}))if(children.has(region))for(const id of ids){
  const source=sourceById.get(id),page=source&&originalBySource.get(id);
  if(page){children.get(region).push(page.id);selected.add(region);}
 }
 for(const page of world.pages){const source=sourceById.get(page.sourceId);if(source){page.sourceProvider=source.origin;page.sourceURL=source.sourceURL||'';if(source.moduleKey)page.moduleKey=source.moduleKey;}}
 const presets=WORLD_PRESETS;
 world.spaces=presets.map(p=>({id:'place-'+p.theme,theme:p.theme,title:p.title,unbuilt:!selected.has(p.id),buildingId:'building-'+p.id,areaId:'area-default',children:[...new Set(children.get(p.id))],functionName:p.title,summary:children.get(p.id).length?children.get(p.id).length+' items':'Ready for your first item',objectKind:'book'}));
 world.buildings=presets.map(p=>({id:'building-'+p.id,title:p.title,unbuilt:!selected.has(p.id),theme:p.theme,position:p.position,color:p.color,summary:p.description,areaId:'area-default',rooms:['place-'+p.theme]}));
 world.areas=[{id:'area-default',title:'My life & work',default:true,buildings:world.buildings.map(b=>b.id),places:world.spaces.map(s=>s.id)}];
 world.viewObjects=[];world.viewSchema='world-region-object-v1';
 world.moduleConnections=(state.connections||[]).map(c=>Object.fromEntries(['id','contentRevision','provider','label','status','syncStatus','syncError','requiredAction','connected','running','synthesizing','reading','failed','needsAttention','savedItemCount','syncedAt','records','summary','resultCount'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]])));
 const revisions=new Map();for(const k of state.knowledge||[]){if(!revisions.has(k.sourceId))revisions.set(k.sourceId,new Set());revisions.get(k.sourceId).add(k.sourceRevision);}
 world.personal={version:2,homeReady,presets:[...selected],sourceCount:sources.length,pendingCount:sources.filter(s=>!revisions.get(s.id)?.has(s.revision)).length};
 world.pages.find(p=>p.id===world.roots[0]).children=[...new Set(world.spaces.flatMap(s=>s.children))];
 world.coverage.pages=world.pages.length-1;
 world.scene.objects=[...world.buildings.map(b=>({id:b.id,parent:'world',template:b.theme,state:b.unbuilt?'planned':'built',position:b.position,contextRefs:b.rooms})),...world.spaces.map(s=>({id:s.id,parent:s.buildingId,template:s.theme,contextRefs:s.children})),...world.pages.filter(p=>p.id!==world.roots[0]).map(p=>({id:p.id,parent:world.spaces.find(s=>s.children.includes(p.id))?.id||p.parent,template:'book',contextRef:p.id}))];
 return world;
}
