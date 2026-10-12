import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {GAME_APPLETS} from '../core/applets/definitions/games.ts';
import {importBuildTheme} from './build-theme-source.ts';

const utilityKeys=new Set(['gmail','google-calendar','apple-notes','apple-reminders','weather','meetings','voice-memos','messages','browser']);
const gameKeys=new Set(GAME_APPLETS.map(a=>a.key));
// These remain runtime Applets; this is the curated art library, not an installation policy.
const excludedKeys=new Set(['ongoing','sekai-rogue-ai-tic-tac-toe','sekai-mixing-colors','sekai-roller-coaster']);
const packagePath='ui/theme-packages/village';
/** Art-library classification is independent of account providers and runtime installation. */
export async function villageSceneLibrary(root:string){
 const presentation=JSON.parse(await readFile(path.join(root,packagePath,'presentation.json'),'utf8'));
 const applets=APP_DEFINITIONS.filter(a=>!excludedKeys.has(a.key)).map(a=>({id:a.key,title:a.title,collection:utilityKeys.has(a.key)||gameKeys.has(a.key)?'core':'branded',
  group:utilityKeys.has(a.key)?'utilities':gameKeys.has(a.key)?'built-in-games':'products-and-external-games',
  icon:presentation.icons[a.key],background:presentation.appletScenes?.[a.key]?.background||`assets/focus/${a.key}.webp`,
  status:presentation.appletScenes?.[a.key]?'registered':'legacy',registrationKey:presentation.appletScenes?.[a.key]?a.key:null}));
 const presets=presentation.appletPresets.map(p=>({id:p.id,title:p.title,collection:'generic',group:p.category,icon:p.icon,background:p.background,status:p.registration?'registered':'legacy',registrationKey:p.id}));
 const entries=[...applets,...presets];
 const counts=Object.fromEntries(['core','generic','branded'].map(c=>[c,entries.filter(e=>e.collection===c).length]));
 assert.equal(counts.branded,100,'Keep exactly 100 curated branded art groups; review additions explicitly');
 const excluded=APP_DEFINITIONS.filter(a=>excludedKeys.has(a.key)).map(a=>({id:a.key,title:a.title,reason:a.key==='ongoing'?'Uses a generic scene for its actual subject':'Overlapping external mini-game; main Sekai entry retained'}));
 assert.equal(excluded.length,excludedKeys.size,'Review obsolete art exclusions');
 return {schemaVersion:1,counts,plannedCore:[{id:'files',title:'Files',status:'planned'},{id:'clock',title:'Clock',status:'planned'}],entries,excluded};
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
