// worldActions() builds its list once per sample flag and hands each caller a deep copy.
// This check keeps the earlier implementation, which rebuilt and cloned every schema per call,
// and proves the cached version returns the same values, the same internal sharing (an Applet
// alias shares its base action's schema) and the same freedom to change a result.
import assert from 'node:assert/strict';
import {listWorldTools,publicWorldToolNames} from '../core/tools/catalog.ts';
import {worldModules} from '../core/tools/modules.ts';
import {APP_DEFINITIONS} from '../core/applets/index.ts';
import {CALENDAR_REQUIRED} from '../core/tools/calendar.ts';
import {SERVICE_ACTIONS,SERVICE_PROVIDERS} from '../contracts/services.ts';
import {worldActions,describeActions,resolveAction,type WorldAction} from '../core/tools/gateway.ts';

const READABLE_SOURCES=APP_DEFINITIONS.flatMap(app=>app.attention&&app.attention.reader!=='observation'&&!SERVICE_PROVIDERS.includes(app.attention.provider)?[app.attention.provider]:[]);
// The earlier worldActions, verbatim.
function oldWorldActions({sample=false}={}):WorldAction[]{
 const definitions=listWorldTools({sample}),actions:WorldAction[]=[];
 const add=(target,action,tool,defaults={})=>{
  const definition=definitions.find(t=>t.name===tool);if(!definition)return;
  const parameters=structuredClone(definition.parameters) as any;
  for(const key of Object.keys(defaults))delete parameters.properties[key];
  parameters.required=(parameters.required||[]).filter(key=>!Object.hasOwn(defaults,key));
  actions.push({target,action,tool,defaults,description:definition.description,parameters,public:publicWorldToolNames.includes(tool)});
 };
 const operations=(target,tool,field='operation',only?:string[])=>{
  const def=definitions.find(t=>t.name===tool) as any;
  for(const action of only||def?.parameters.properties[field]?.enum||[])add(target,action,tool,{[field]:action});
 };
 for(const [target,action,tool] of [
  ['artifact','show','show_artifact'],['artifact','list','list_artifacts'],['artifact','open','open_artifact'],['artifact','brief','read_artifact_brief'],['artifact','page','save_artifact_page'],['world','inspect','inspect_world'],['world','open','visit_context'],['world','navigate','move_view'],['world','act','perform_action'],
  ['world','lighting','set_scene_lighting'],['world','weather','set_scene_weather'],['world','link','share_world_link'],['applets','open','open_applet'],['applets','delegate','start_applet_task'],
  ['content','search','find_content'],['content','open','open_content'],['content','read','read_content_page'],
  ['content','create','create_content'],['content','update','patch_content'],['content','delete','delete_content'],
  ['content','trash','list_deleted'],['content','restore','restore_content'],['content','undo','undo_content'],
  ['codex','submit','delegate_codex'],['codex','list','list_codex_tasks'],['codex','read','read_codex_task'],['codex','show','show_codex_task'],
  ['games','make','make_game'],['games','list','list_made_games'],['games','save','save_game'],['games','source','read_made_game'],
  ['moments','make','make_applet'],['moments','list','list_made_applets'],['moments','save','save_applet'],['moments','source','read_applet'],['moments','data','update_applet_data'],['moments','read','read_applet_data'],
  ['settings','open','open_worldlet_controls'],['settings','update','set_worldlet_preference'],
  ['items','query','query_world_items'],['items','save','upsert_world_items'],['items','review','review_world_item'],
  ['items','update','update_world_item'],['items','archive','archive_world_items'],['history','query','read_world_history'],['companion','recall','read_companion_archive'],['companion','memory','manage_companion_memory'],['companion','reply','reply_in_channel'],
  ['checks','configure','configure_world_check'],['meetings','decisions','meeting_decisions'],['applets','status','update_applet_state'],
  ['notion','reviews','review_notion_drafts'],['notion','draft','prepare_notion_change'],['gmail','draft','prepare_email'],['gmail','reviews','review_email_drafts'],['practice','iteration','run_practice_iteration'],['companion','customize','customize_companion'],
 ])add(target,action,tool);
 for(const provider of ['google-calendar','apple-reminders','apple-notes','todoist'])add(provider,'draft','prepare_home_change',{provider});
 // Worldlet's own Calendar events are calendar/*; google-calendar/draft is only for the Mac's Calendar app.
 for(const action of actions.filter(a=>a.target==='google-calendar'&&a.action==='draft'))action.description='Only for the Mac\'s own Calendar app. To add, move or delete an event in Worldlet\'s Calendar use calendar/add, calendar/change or calendar/delete. '+action.description;
 for(const provider of READABLE_SOURCES)add(provider,'read','read_world_source',{provider});
 if(sample){
  add('gmail','search','find_content');
  actions[actions.length-1].description='Search the practice world\'s emails (saved in this world as items) by sender, subject or words, and return a few matches with IDs to read.';
  add('gmail','read_saved','read_content_page');
  actions[actions.length-1].description='Read one practice email by the ID a gmail/search result returned.';
 }
 add('google-drive','read','read_connected_google',{service:'google-drive'});
 if(definitions.some(t=>t.name==='read_service'))for(const [provider,operations] of Object.entries(SERVICE_ACTIONS))for(const [operation,required] of Object.entries(operations)){
  add(provider,operation,'read_service',{provider,operation});
  actions[actions.length-1].parameters.required=[...required??[]];
 }
 operations('calendar','manage_calendar');
 for(const action of actions.filter(a=>a.tool==='manage_calendar'))action.parameters.required=CALENDAR_REQUIRED[action.action];
 operations('asks','agent_asks');
 for(const action of actions.filter(a=>a.tool==='agent_asks'))action.parameters.required={post:['title'],read:[],claim:[],resolve:['id','note','expectedRevision']}[action.action]??[];
 operations('weather','manage_weather_location');
 for(const action of actions.filter(a=>a.tool==='manage_weather_location'))action.parameters.required=action.action==='search'?['query']:action.action==='select'?['choice']:[];
 operations('music','control_background_music');operations('local-music','control_local_music');operations('youtube','use_youtube');operations('stripe','use_stripe_crm');
 operations('doordash','use_doordash');operations('routines','manage_routines','action');operations('checklist','practice_applet','action');
 operations('browser','automate_browser','operation',['open','snapshot','do','click','fill','submit','back','forward','receipts','outcome']);
 operations('browser','browse_web','operation',['history','records','record','bookmarks','save','saved','home','read','outline','focus']);
 add('browser','scroll','scroll_browser');
 add('browser','scroll_region','automate_browser',{operation:'scroll'});
 for(const action of actions.filter(a=>a.tool==='automate_browser')){
  const required={outcome:['receiptId'],open:['url'],do:[],click:['documentId','ref'],fill:['documentId','ref','text'],submit:['documentId','ref'],scroll_region:['direction']}[action.action];
  if(required)action.parameters.required=required;
  if(['click','fill','submit'].includes(action.action))action.description='Pass both documentId and ref exactly from the latest browser/snapshot result. '+action.description;
 }
 for(const action of actions.filter(a=>a.tool==='browse_web'&&a.action==='record'))action.parameters.required=['id'];
 for(const action of actions.filter(a=>a.tool==='browse_web'&&a.action==='focus'))action.parameters.required=['hide'];
 for(const read of actions.filter(a=>a.tool==='read_content_page'))read.parameters.required=['id'];
 for(const module of worldModules)for(const action of module.actions)add(module.target,action.action,action.name);
 const base=actions.slice();
 for(const app of APP_DEFINITIONS){
  const target='applet:'+app.key;
  add(target,'launch','open_applet',{id:app.id});
  const launch=actions[actions.length-1];
  launch.description=`Open ${app.title} in Worldlet. This does not connect an account or grant access to private content.`;
  if(!sample){
   add(target,'runtime','query_world_items',{provider:app.attention?.provider||app.key});
   actions[actions.length-1].description=`Inspect saved items and available runtime task/operation status for ${app.title}. This does not start synchronization or execute an action.`;
  }
  const owners=new Set([app.key,app.attention?.provider].filter(Boolean));
  for(const action of base.filter(a=>owners.has(a.target))){
   if(['launch','runtime'].includes(action.action))throw Error('Reserved Applet command.');
   actions.push({...action,target});
  }
 }
 if(new Set(actions.map(a=>a.target+'/'+a.action)).size!==actions.length)throw Error('Duplicate World target/action.');
 return actions;
}

// Numbers every object in first-visit order: two lists with the same numbering share objects
// in the same places (structuredClone semantics).
function shape(root:unknown){
 const ids=new Map<object,number>(),out:number[]=[];
 const walk=(value:unknown)=>{
  if(value===null||typeof value!=='object')return;
  const seen=ids.get(value);if(seen!==undefined){out.push(seen);return;}
  ids.set(value,ids.size);out.push(ids.size-1);
  for(const key of Object.keys(value))walk((value as any)[key]);
 };
 walk(root);return out;
}
function objects(root:unknown,into=new Set<object>()){
 if(root===null||typeof root!=='object'||into.has(root))return into;
 into.add(root);for(const key of Object.keys(root))objects((root as any)[key],into);return into;
}

const inputs:[string,()=>WorldAction[],()=>WorldAction[]][]=[
 ['no argument',()=>oldWorldActions(),()=>worldActions()],
 ['empty options',()=>oldWorldActions({}),()=>worldActions({})],
 ['sample false',()=>oldWorldActions({sample:false}),()=>worldActions({sample:false})],
 ['sample true',()=>oldWorldActions({sample:true}),()=>worldActions({sample:true})],
 ['sample falsy',()=>oldWorldActions({sample:0 as any}),()=>worldActions({sample:0 as any})],
 ['sample truthy',()=>oldWorldActions({sample:1 as any}),()=>worldActions({sample:1 as any})],
];
const compare=(label:string)=>{
 for(const [name,old,next] of inputs){
  const expected=old(),first=next(),second=next();
  assert.deepStrictEqual(first,expected,label+' '+name);
  assert.deepStrictEqual(second,expected,label+' '+name+' (cached)');
  assert.deepStrictEqual(shape(first),shape(expected),label+' '+name+' sharing');
  // Two calls share no object with each other.
  const a=objects(first);for(const value of objects(second))assert.ok(!a.has(value),label+' '+name+' calls share an object');
  // The gateway answers identically from either list.
  for(const target of ['',...new Set(expected.map(x=>x.target))]){
   assert.deepStrictEqual(describeActions(first,target),describeActions(expected,target));
   for(const action of expected.filter(x=>x.target===target))assert.deepStrictEqual(describeActions(first,target,action.action),describeActions(expected,target,action.action));
  }
  for(const action of expected){
   const args={probe:1};
   assert.deepStrictEqual(resolveAction(first,action.target,action.action,args),resolveAction(expected,action.target,action.action,args));
  }
 }
};
compare('static catalog');

// Changing a result in every way a caller could leaves the next call untouched.
for(const sample of [false,true]){
 const changed=worldActions({sample});
 for(const action of changed){
  action.description='changed';action.public=!action.public;(action.defaults as any).injected=true;
  action.parameters.required?.push?.('injected');action.parameters.properties&&(action.parameters.properties.injected={type:'string'});
  for(const key of Object.keys(action.parameters.properties||{}))if(key!=='injected')delete action.parameters.properties[key];
 }
 changed.length=0;
 assert.deepStrictEqual(worldActions({sample}),oldWorldActions({sample}),'a changed result reached the next call');
}

// The list follows worldModules, the one documented place new actions come from.
worldModules.push({target:'equivalence-probe',actions:[{action:'ping',name:'equivalence_probe_ping',description:'Probe.',parameters:{type:'object',properties:{x:{type:'string'}},required:['x']}}]});
assert.ok(worldActions().some(a=>a.target==='equivalence-probe'));
compare('with a module');
worldModules.pop();
assert.ok(!worldActions().some(a=>a.target==='equivalence-probe'));
compare('after the module is removed');

console.log('PASS worldActions matches the per-call implementation for every input, with independent results and module changes');
