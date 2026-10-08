import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {practiceTools} from '../core/tools/index.ts';
import {mkdir,copyFile,writeFile,readdir,rm} from 'node:fs/promises';
import {listWorldTools,worldGatewayTools,publicWorldToolNames,serviceToolNames,WORLD_TOOL_VERSION} from '../core/tools/catalog.ts';
import {worldActions} from '../core/tools/gateway.ts';
import {derivationInstructions} from '../core/agent/context-derivation.ts';
import {instructions} from '../core/agent/fox-instructions.ts';
import {replyActionIds} from '../ui/companion/reply-actions.ts';
const worldToolCatalog=listWorldTools();
const output=process.env.WORLDLET_UI_BUILD_OUTPUT ? pathToFileURL(path.join(process.env.WORLDLET_UI_BUILD_OUTPUT,'hermes')+'/') : new URL('../dist/WorldletWeb/hermes/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('services.json',output),JSON.stringify(worldToolCatalog.filter(t=>serviceToolNames.has(t.name))));
// Every adapter module is runtime code. Keep the bundle complete when a helper
// is extracted: an explicit copy list previously omitted gmail_reader.py.
const adapters=new URL('../harness/hermes/',import.meta.url);
const modules=new Set(await readdir(adapters));
// Drop retired generated modules when rebuilding an existing dev bundle.
for(const name of await readdir(output))if(name.endsWith('.py')&&!modules.has(name))await rm(new URL(name,output));
for(const entry of await readdir(adapters,{withFileTypes:true})){
 if(entry.isFile()&&entry.name.endsWith('.py'))await copyFile(new URL(entry.name,adapters),new URL(entry.name,output));
}
await writeFile(new URL('tools.json',output),JSON.stringify({practiceTools,actions:worldActions(),sampleActions:worldActions({sample:true}),version:WORLD_TOOL_VERSION,gatewayTools:worldGatewayTools,publicTools:publicWorldToolNames,tools:worldToolCatalog,replyActions:replyActionIds,instructions:instructions+'\nYou run on local Hermes. Worldlet is your scene and interaction layer. Answer questions by using the authorized live MCP/API/local tools when current external information is needed; do not require a source sync or prior import. Do not automatically copy external content into Worldlet notes or its source library. Keep durable preferences with Hermes. Worldlet owns durable tasks, events and updates: use query_world_items, read_world_source and upsert_world_items for grounded findings, never conversation memory as the task database. Use update_world_item for user-requested status changes and configure_world_check for requested check schedules. Do not copy whole sources into notes. After reading a connected app, use update_applet_state to reflect actual findings and attention needs in its scene; only if this tool is available. Read counts cover the returned result, never the whole account. Use Hermes memory for durable user preferences and skills for reusable workflows. For current public information use web_search and cite source URLs. The default search provider supplies titles, URLs and snippets; web_extract needs a separately configured extraction provider. Use automate_browser to read full pages in the visible Worldlet browser, not arbitrary desktop control. Use manage_routines only for explicit scheduling requests; Worldlet must remain open and awake. Worldlet tools are the source of truth for world state. Never infer external action success from a scene change. Help the user configure Worldlet using open_worldlet_controls. Do not direct them to the old Settings panels. Never request API keys in chat; open the model guide for secure entry.',derivation:derivationInstructions}));
await copyFile(new URL('../harness/hermes/runtime.json',import.meta.url),new URL('runtime.json',output));
await copyFile(new URL('../contracts/model-sources.json',import.meta.url),new URL('model-sources.json',output));
await rm(new URL('default-model.json',output),{force:true});
await copyFile(new URL('../core/agent/turn-trust.json',import.meta.url),new URL('turn-trust.json',output));
