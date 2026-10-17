import {listWorldTools,publicWorldToolNames,WORLD_TOOL_VERSION} from './catalog.ts';
import {worldModules} from './modules.ts';
import {APP_DEFINITIONS} from '../applets/index.ts';
import {CALENDAR_REQUIRED} from './calendar.ts';
import {SERVICE_ACTIONS,SERVICE_PROVIDERS} from '../../contracts/services.ts';
// Every Applet with a source-reader or calendar attention registration is readable through the gateway, except a
// Worldlet Service's: its own Attention reads are the World's, and an Agent reads it only through read_service.
const READABLE_SOURCES=APP_DEFINITIONS.flatMap(app=>app.attention&&app.attention.reader!=='observation'&&!SERVICE_PROVIDERS.includes(app.attention.provider)?[app.attention.provider]:[]);

export type WorldAction={target:string;action:string;tool:string;description:string;parameters:any;defaults:Record<string,unknown>;public:boolean};
// Only the World knows implementation names. Models address a target + action.
// Future templates provide the same descriptors and an executor; no new model tool.
// Every input is a module constant (the catalogs, Applet definitions and worldModules), so the
// list is built once per sample flag. Each call still gets its own deep copy: callers may change
// what they receive without reaching the cache or a later call.
const built=new Map<boolean,{modules:number;actions:WorldAction[]}>();
export function worldActions({sample=false}={}):WorldAction[]{
 const key=!!sample;let entry=built.get(key);
 if(!entry||entry.modules!==worldModules.length){entry={modules:worldModules.length,actions:buildWorldActions(key)};built.set(key,entry);}
 return copyPlain(entry.actions,new Map());
}
// Copies plain objects and arrays, keeping objects shared inside the list (an Applet alias and
// its base action) shared in the copy, as structuredClone would.
function copyPlain(value,seen:Map<object,any>){
 if(value===null||typeof value!=='object')return value;
 let copy=seen.get(value);if(copy)return copy;
 if(Array.isArray(value)){
  copy=new Array(value.length);seen.set(value,copy);
  for(let i=0;i<value.length;i++)copy[i]=copyPlain(value[i],seen);
  return copy;
 }
 if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('World action schemas must be plain data.');
 copy={};seen.set(value,copy);
 for(const key of Object.keys(value))copy[key]=copyPlain(value[key],seen);
 return copy;
}
function buildWorldActions(sample:boolean):WorldAction[]{
 const definitions=listWorldTools({sample}),actions:WorldAction[]=[];
 const add=(target,action,tool,defaults={}):WorldAction|undefined=>{
  const definition=definitions.find(t=>t.name===tool);if(!definition)return;
  const parameters=structuredClone(definition.parameters) as any;
  for(const key of Object.keys(defaults))delete parameters.properties[key];
  parameters.required=(parameters.required||[]).filter(key=>!Object.hasOwn(defaults,key));
  const added={target,action,tool,defaults,description:definition.description,parameters,public:publicWorldToolNames.includes(tool)};
  actions.push(added);return added;
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
 // The practice world has no connected sources (read_world_source is a service tool): its fictional
 // emails are saved items, so Mail searches and reads them as content. Without this, gmail offered
 // only draft/reviews and Codex concluded mail could not be read (RC 5310217c).
 if(sample){
  const search=add('gmail','search','find_content');
  if(search)search.description='Search the practice world\'s emails (saved in this world as items) by sender, subject or words, and return a few matches with IDs to read.';
  // Not gmail/read: that name is the live source reader, which a practice world never discovers.
  const read=add('gmail','read_saved','read_content_page');
  if(read)read.description='Read one practice email by the ID a gmail/search result returned.';
 }
 add('google-drive','read','read_connected_google',{service:'google-drive'});
 // Worldlet Services (contracts/services.ts): each read is its own Grant target (github/list, posthog/query…), with
 // the arguments that operation requires.
 for(const [provider,operations] of Object.entries(SERVICE_ACTIONS))for(const [operation,required] of Object.entries(operations)){
  const read=add(provider,operation,'read_service',{provider,operation});
  if(read)read.parameters.required=[...required??[]];
 }
 // The person's own events (core/tools/calendar.ts); each operation names what it needs.
 operations('calendar','manage_calendar');
 for(const action of actions.filter(a=>a.tool==='manage_calendar'))action.parameters.required=CALENDAR_REQUIRED[action.action];
 // Agent asks (core/agent/asks.ts): each its own Grant target, which only "Can ask you" and "Can take work" name.
 operations('asks','agent_asks');
 for(const action of actions.filter(a=>a.tool==='agent_asks'))action.parameters.required={post:['title'],read:[],claim:[],resolve:['id','note','expectedRevision'],attachment:['id','attachment']}[action.action]??[];
 // The board (core/board/README.md): each its own Grant target, which only "Can see your board" and "Can set up your
 // board" name.
 operations('board','world_board');
 for(const action of actions.filter(a=>a.tool==='world_board'))action.parameters.required=action.action==='define'?['definition','expectedRevision']:[];
 // Agent reports (core/agent/reports.ts): each its own Grant target, which only "Can report its work" and "Can see
 // other Agents" name.
 operations('agents','agent_reports');
 for(const action of actions.filter(a=>a.tool==='agent_reports'))action.parameters.required=action.action==='report'?['status']:[];
 // GitHub drafts (core/agent/github-drafts.ts): each its own Grant target, which only "Can draft GitHub changes" names.
 operations('github-drafts','github_drafts');
 for(const action of actions.filter(a=>a.tool==='github_drafts'))action.parameters.required=action.action==='create'?['write','target']:[];
 // The conversation archive (core/agent/conversations.ts): each its own Grant target, which only "Can save
 // conversations" and "Can search conversations" name.
 operations('conversations','world_conversations');
 for(const action of actions.filter(a=>a.tool==='world_conversations'))action.parameters.required=action.action==='add'?['source','messages']:[];
 // Tracked links (core/agent/tracked-links.ts): each its own Grant target, which only "Can see your tracked links" and
 // "Can keep your tracked links" name.
 operations('links','world_links');
 for(const action of actions.filter(a=>a.tool==='world_links'))action.parameters.required=action.action==='save'?['rows']:[];
 // Standing GitHub writes (core/agent/GRANTS.md#standing-github-writes): their own Grant target, which only a standing
 // GitHub write Grant for one repository names.
 operations('github-writes','github_writes');
 for(const action of actions.filter(a=>a.tool==='github_writes'))action.parameters.required=['write','target'];
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
  const launch=add(target,'launch','open_applet',{id:app.id});
  if(launch)launch.description=`Open ${app.title} in Worldlet. This does not connect an account or grant access to private content.`;
  if(!sample){
   const runtime=add(target,'runtime','query_world_items',{provider:app.attention?.provider||app.key});
   if(runtime)runtime.description=`Inspect saved items and available runtime task/operation status for ${app.title}. This does not start synchronization or execute an action.`;
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
/** Every target and its actions on one line, for a Harness's instructions: the model calls an action it already
 * knows instead of listing targets and actions first, each listing another model round of several seconds (owner
 * 2026-10-12: Fox slow; one reply spent 6 of its 9 model calls discovering companion/recall). Each action carries
 * its required argument names, `snapshot()` taking none: on 4416 Fox still described browser/read and
 * browser/snapshot before calling them, two rounds (~8 s) for actions that take "{}" (owner 2026-10-14: the conversation is still slow).
 * Applet aliases (`applet:<key>`) are left out: they repeat their base target's actions. */
export function worldToolIndex({sample=false}={}){
 const actions=worldActions({sample}).filter(a=>!a.target.startsWith('applet:'));
 const required=(a:WorldAction):string[]=>Array.isArray(a.parameters?.required)?a.parameters.required:[];
 // Operation families (music, youtube, doordash…) share one schema whose `required` is empty for every action, so
 // their real needs are unknown here: those keep bare names and are described when needed.
 const known=new Set(actions.filter(a=>!Object.keys(a.defaults).length||required(a).length).map(a=>a.target));
 const byTarget=new Map<string,string[]>();
 for(const a of actions)byTarget.set(a.target,[...byTarget.get(a.target)||[],known.has(a.target)||!Object.keys(a.parameters?.properties||{}).length?`${a.action}(${required(a).join(',')})`:a.action]);
 return [...byTarget].map(([target,actions])=>target+': '+actions.join(', ')).join('; ');
}
/** The World actions behind internal tool names an instruction names (an Applet analysis says "read it with
 * query_world_items"): a local Agent has only call_world_tool, so it must be told which target and action that is, or
 * it answers that the tools "aren't available" and saves nothing (Mac Alpha 4450/4459 and Beta 4464 test:onboarding,
 * 2026-10-15/16: Codex had the worldlet server and made no call). Empty when the text names none. */
export function worldToolAliases(text:string,{sample=false}={}):string{
 const named=new Map<string,WorldAction>();
 for(const a of worldActions({sample}))if(!a.target.startsWith('applet:')&&!Object.keys(a.defaults).length&&!named.has(a.tool)&&new RegExp(`\\b${a.tool}\\b`).test(text))named.set(a.tool,a);
 if(!named.size)return '';
 return 'Tool names in the message are World actions you call through call_world_tool, and they are available here: '
  +[...named.values()].map(a=>`${a.tool} is target "${a.target}", action "${a.action}"`).join('; ')
  +'. Pass that tool\'s arguments as the arguments JSON string.';
}
export function describeActions(actions:WorldAction[],target='',action=''){
 if(!target)return {version:WORLD_TOOL_VERSION,targets:[...new Set(actions.map(a=>a.target))]};
 const matches=actions.filter(a=>a.target===target);
 if(!matches.length)return {error:'Unknown target. Discover available targets first.'};
 if(!action)return {target,actions:matches.map(a=>({action:a.action,description:a.description.split('. ')[0].slice(0,100),requiresPrivateContext:!a.public}))};
 const found=matches.find(a=>a.action===action);
 return found?{target,action,description:found.description,parameters:found.parameters,requiresPrivateContext:!found.public}:{error:'Unknown action for this target.'};
}
/** The actions one Agent may reach (core/agent/GRANTS.md): `covers` is its Grants' answer for a target and action.
 * `describe_world_tools` lists only these, so an Agent never discovers a target no Grant names. */
export function grantedActions(actions:WorldAction[],covers:(target:string,action:string)=>boolean):WorldAction[]{
 return actions.filter(a=>covers(a.target,a.action));
}
/** The target and action a resolved call came from: the first action of that tool whose fixed routing fields match the
 * arguments, a base target before its Applet alias. Null when no action resolves to it (a Hermes-internal event). */
export function worldActionOf(actions:WorldAction[],tool:string,args:Record<string,unknown>={}):{target:string;action:string}|null{
 const matches=actions.filter(a=>a.tool===tool&&Object.keys(a.defaults).every(key=>args?.[key]===a.defaults[key]));
 const found=matches.find(a=>!a.target.startsWith('applet:'))??matches[0];
 return found?{target:found.target,action:found.action}:null;
}
export function resolveAction(actions:WorldAction[],target,action,args){
 const found=actions.find(a=>a.target===target&&a.action===action);
 if(!found)throw Error('Unknown target or action. Discover capabilities first.');
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Arguments must be a JSON object.');
 // Fixed routing fields cannot be overridden to cross into another Applet.
 for(const key of Object.keys(found.defaults))if(Object.hasOwn(args,key))throw Error('Do not override routing field '+key);
 return {name:found.tool,args:{...(found.tool==='read_content_page'?{offset:0}:{}),...args,...found.defaults},definition:found};
}
