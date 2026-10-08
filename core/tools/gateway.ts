import {listWorldTools,publicWorldToolNames,WORLD_TOOL_VERSION} from './catalog.ts';
import {worldModules} from './modules.ts';
import {APP_DEFINITIONS} from '../applets/index.ts';
import {CALENDAR_REQUIRED} from './calendar.ts';
// Every Applet with a source-reader or calendar attention registration is readable through the gateway.
const READABLE_SOURCES=APP_DEFINITIONS.flatMap(app=>app.attention&&app.attention.reader!=='observation'?[app.attention.provider]:[]);

export type WorldAction={target:string;action:string;tool:string;description:string;parameters:any;defaults:Record<string,unknown>;public:boolean};
// Only the World knows implementation names. Models address a target + action.
// Future templates provide the same descriptors and an executor; no new model tool.
export function worldActions({sample=false}={}):WorldAction[]{
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
  ['artifact','show','show_artifact'],['artifact','list','list_artifacts'],['artifact','open','open_artifact'],['world','inspect','inspect_world'],['world','open','visit_context'],['world','navigate','move_view'],['world','act','perform_action'],
  ['world','lighting','set_scene_lighting'],['world','weather','set_scene_weather'],['applets','open','open_applet'],['applets','delegate','start_applet_task'],
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
 // The practice world has no connected sources (read_world_source is a service tool): its fictional
 // emails are saved items, so Mail searches and reads them as content. Without this, gmail offered
 // only draft/reviews and Codex concluded mail could not be read (RC 5310217c).
 if(sample){
  add('gmail','search','find_content');
  actions[actions.length-1].description='Search the practice world\'s emails (saved in this world as items) by sender, subject or words, and return a few matches with IDs to read.';
  // Not gmail/read: that name is the live source reader, which a practice world never discovers.
  add('gmail','read_saved','read_content_page');
  actions[actions.length-1].description='Read one practice email by the ID a gmail/search result returned.';
 }
 add('google-drive','read','read_connected_google',{service:'google-drive'});
 // The person's own events (core/tools/calendar.ts); each operation names what it needs.
 operations('calendar','manage_calendar');
 for(const action of actions.filter(a=>a.tool==='manage_calendar'))action.parameters.required=CALENDAR_REQUIRED[action.action];
 operations('weather','manage_weather_location');
 for(const action of actions.filter(a=>a.tool==='manage_weather_location'))action.parameters.required=action.action==='search'?['query']:action.action==='select'?['choice']:[];
 operations('music','control_background_music');operations('local-music','control_local_music');operations('youtube','use_youtube');operations('stripe','use_stripe_crm');
 operations('doordash','use_doordash');operations('routines','manage_routines','action');operations('checklist','practice_applet','action');
 operations('browser','automate_browser','operation',['open','snapshot','do','click','fill','submit','back','forward','receipts','outcome']);
 operations('browser','browse_web','operation',['history','records','record','bookmarks','save','saved','home','read','outline','focus']);
 add('browser','scroll','scroll_browser');
 add('browser','scroll_region','automate_browser',{operation:'scroll'});
 // Operation-specific requirements must reach the model and gateway validator.
 for(const action of actions.filter(a=>a.tool==='automate_browser')){
  const required={outcome:['receiptId'],open:['url'],do:[],click:['documentId','ref'],fill:['documentId','ref','text'],submit:['documentId','ref'],scroll_region:['direction']}[action.action];
  if(required)action.parameters.required=required;
  if(['click','fill','submit'].includes(action.action))action.description='Pass both documentId and ref exactly from the latest browser/snapshot result. '+action.description;
 }
 for(const action of actions.filter(a=>a.tool==='browse_web'&&a.action==='record'))action.parameters.required=['id'];
 for(const action of actions.filter(a=>a.tool==='browse_web'&&a.action==='focus'))action.parameters.required=['hide'];
 // A paged read is the same operation, not another model-facing tool.
 for(const read of actions.filter(a=>a.tool==='read_content_page'))read.parameters.required=['id'];
 for(const module of worldModules)for(const action of module.actions)add(module.target,action.action,action.name);
 // Each Applet exposes commands through the existing gateway, not a second executor.
 // Snapshot base actions before adding namespaces so aliases cannot recursively expand.
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
export function describeActions(actions:WorldAction[],target='',action=''){
 if(!target)return {version:WORLD_TOOL_VERSION,targets:[...new Set(actions.map(a=>a.target))]};
 const matches=actions.filter(a=>a.target===target);
 if(!matches.length)return {error:'Unknown target. Discover available targets first.'};
 if(!action)return {target,actions:matches.map(a=>({action:a.action,description:a.description.split('. ')[0].slice(0,100),requiresPrivateContext:!a.public}))};
 const found=matches.find(a=>a.action===action);
 return found?{target,action,description:found.description,parameters:found.parameters,requiresPrivateContext:!found.public}:{error:'Unknown action for this target.'};
}
export function resolveAction(actions:WorldAction[],target,action,args){
 const found=actions.find(a=>a.target===target&&a.action===action);
 if(!found)throw Error('Unknown target or action. Discover capabilities first.');
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Arguments must be a JSON object.');
 // Fixed routing fields cannot be overridden to cross into another Applet.
 for(const key of Object.keys(found.defaults))if(Object.hasOwn(args,key))throw Error('Do not override routing field '+key);
 return {name:found.tool,args:{...(found.tool==='read_content_page'?{offset:0}:{}),...args,...found.defaults},definition:found};
}
