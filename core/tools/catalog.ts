import {presentationTools} from './presentation.ts';
import {worldTools} from './navigation.ts';
import {contentTools} from './content.ts';
import {companionTools} from './applets.ts';
import {codexTools} from './coding.ts';
import {foxControls} from './controls.ts';
import {practiceTools} from './practice.ts';
import {gameTools} from './games.ts';
import {widgetTools} from './widgets.ts';
import {calendarTools} from './calendar.ts';
import {GAME_MAKING_OPEN} from '../games/index.ts';
import services from './services.json' with {type:'json'};
import {WORLD_APPS} from '../applets/index.ts';
import {worldModules} from './modules.ts';

// Local-original owners are not connected Applets. Native hosts validate support and receipts.
const providers=[...new Set([...WORLD_APPS.map(app=>app.provider||app.key),'note','file','x-bookmark'])].sort();
for(const definition of services as any[]){
 if(definition.name==='query_world_items')definition.parameters.properties.provider.enum=providers;
 if(definition.name==='upsert_world_items')definition.parameters.properties.items.items.properties.provider.enum=providers;
}

// The World owns capabilities. Harnesses consume this catalog, never a copy.
export const WORLD_TOOL_VERSION=2;
export const serviceToolNames=new Set(services.map(t=>t.name));
export const worldToolCatalog=[...worldTools,...presentationTools,...contentTools,...companionTools,...codexTools,...(GAME_MAKING_OPEN?gameTools:[]),...widgetTools,...calendarTools,...foxControls,...services];
export const publicWorldToolNames=['scroll_browser','open_applet','open_worldlet_controls','set_worldlet_preference','control_background_music'];
export function listWorldTools({sample=false}={}){
 const builtIn=sample?[...worldToolCatalog.filter(t=>!serviceToolNames.has(t.name)),...practiceTools]:worldToolCatalog;
 const tools=[...builtIn,...worldModules.flatMap(module=>module.actions)];
 if(new Set(tools.map(tool=>tool.name)).size!==tools.length)throw Error('Duplicate World implementation name.');
 return tools;
}

// Small-context models discover full schemas on demand. JSON preserves optional
// fields, booleans, unions and arrays without a second native schema compiler.
export const worldGatewayTools=[
 {name:'describe_world_tools',description:'Discover World/Applet/template capabilities. Empty target and action lists targets; target with empty action lists its actions; target and action returns the argument schema. Examples: music/play, browser/open, codex/submit, gmail/read. Permissions are checked when executing.',parameters:{type:'object',properties:{target:{type:'string'},action:{type:'string'}},required:['target','action'],additionalProperties:false}},
 {name:'call_world_tool',description:'Execute an advertised World/Applet/template action. Use target, action and arguments as a JSON object encoded in a string. Read its schema first. No arbitrary commands. Confirm success only from the result.',parameters:{type:'object',properties:{target:{type:'string'},action:{type:'string'},arguments:{type:'string'}},required:['target','action','arguments'],additionalProperties:false}},
];
