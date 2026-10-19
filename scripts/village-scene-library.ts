import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {APP_DEFINITIONS} from '../context/applets/catalog.ts';
import {GAME_APPLETS} from '../context/applets/definitions/games.ts';
import {importBuildTheme} from './build-theme-source.ts';

const utilityKeys=new Set(['gmail','google-calendar','apple-notes','apple-reminders','weather','meetings','voice-memos','messages','browser']);
const gameKeys=new Set(GAME_APPLETS.map(a=>a.key));
// These remain runtime Applets; this is the curated art library, not an installation policy.
const excludedKeys=new Set(['ongoing','board','sekai-rogue-ai-tic-tac-toe','sekai-mixing-colors','sekai-roller-coaster']);
const packagePath='ui/style/theme-packages/village';
/** Art-library classification is independent of account providers and runtime installation. */
export async function villageSceneLibrary(root:string){
 const presentation=JSON.parse(await readFile(path.join(root,packagePath,'presentation.json'),'utf8'));
 const catalog=JSON.parse(await readFile(path.join(root,'resources/styles/builtin/references/registered-scenes/catalog.json'),'utf8'));
 const applets=APP_DEFINITIONS.filter(a=>!excludedKeys.has(a.key)).map(a=>({id:a.key,title:a.title,collection:utilityKeys.has(a.key)||gameKeys.has(a.key)?'core':'branded',
  group:utilityKeys.has(a.key)?'utilities':gameKeys.has(a.key)?'built-in-games':'products-and-external-games',
  icon:presentation.icons[a.key],background:presentation.appletScenes?.[a.key]?.background||`assets/focus/${a.key}.webp`,
  status:presentation.appletScenes?.[a.key]?'registered':'legacy',registrationKey:presentation.appletScenes?.[a.key]?a.key:null}));
 const presets=presentation.appletPresets.map(p=>({id:p.id,title:p.title,collection:'generic',group:p.category,icon:p.icon,background:p.background,status:p.registration?'registered':'legacy',registrationKey:p.id}));
 const core=catalog.applets.map(a=>({id:a.id,title:a.title,collection:'core',group:a.group||'utilities',icon:presentation.icons[a.id],background:presentation.appletScenes[a.id].background,status:'registered',registrationKey:a.id}));
 const entries=[...core,...presets,...applets.filter(a=>a.collection==='branded')];
 const counts=Object.fromEntries(['core','generic','branded'].map(c=>[c,entries.filter(e=>e.collection===c).length]));
 assert.equal(counts.branded,100,'Keep exactly 100 curated branded art groups; review additions explicitly');
 assert.equal(counts.core,24);assert.equal(counts.generic,16);
 assert.equal(new Set(entries.map(e=>e.id)).size,140,'Each art selection has a distinct key');
 const excluded=APP_DEFINITIONS.filter(a=>excludedKeys.has(a.key)).map(a=>({id:a.key,title:a.title,reason:a.key==='ongoing'?'Uses a generic scene for its actual subject':a.key==='board'?'A built-in board with drawn interim art; no curated scene yet':'Overlapping external mini-game; main Sekai entry retained'}));
 assert.equal(excluded.length,excludedKeys.size,'Review obsolete art exclusions');
 return {schemaVersion:1,counts,entries,excluded};
}
export async function checkVillageSceneLibrary(root:string){
 const actual=JSON.parse(await readFile(path.join(root,packagePath,'scene-library.json'),'utf8'));
 assert.deepEqual(actual,await villageSceneLibrary(root),'Regenerate the Village scene library');
 console.log('PASS Village scene library: 100 branded groups, explicit exclusions and reusable presets');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(process.argv.includes('--check'))await checkVillageSceneLibrary(root);
 else{await writeFile(path.join(root,packagePath,'scene-library.json'),JSON.stringify(await villageSceneLibrary(root),null,2)+'\n');await importBuildTheme(path.join(root,packagePath),root);}
}
