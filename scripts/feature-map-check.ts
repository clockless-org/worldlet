// Every ui/, agent/ and context/ folder, and every host module, belongs to exactly one component row in
// docs/UI-CORE-PLATFORM.md#features (World, Applets, Companion, Attention, Tasks, Gate, Store, Connectors, App, Windows).
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
const FEATURES=['World','Applets','Companion','Attention','Tasks','Gate','Store','Connectors','App','Windows'];
const doc=readFileSync('docs/UI-CORE-PLATFORM.md','utf8');
const start=doc.indexOf('## Components across the layers'),end=doc.indexOf('\n## ',start+1);
if(start<0)throw Error('docs/UI-CORE-PLATFORM.md has no "Components across the layers" section.');
const rows=doc.slice(start,end).split('\n').filter(line=>FEATURES.some(feature=>line.startsWith(`| ${feature} |`)));
const found=rows.map(row=>row.split('|')[1].trim());
if(found.join('\n')!==FEATURES.join('\n'))throw Error(`Expected the feature rows ${FEATURES.join(', ')}; found ${found.join(', ')}.`);
const COMPONENT_ROOTS=['ui','agent','context'].filter(root=>existsSync(root));
const owner=new Map<string,string>(),problems:string[]=[];
for(const row of rows){
 const feature=row.split('|')[1].trim();
 for(const [,dir] of row.matchAll(/`((?:ui|agent|context)\/[a-z-]+|platform\/host\/modules\/[a-z-]+(?:\.ts)?)\/?`/g)){
  if(owner.has(dir))problems.push(`${dir} is listed under ${owner.get(dir)} and ${feature}.`);
  owner.set(dir,feature);
 }
}
const featureOf=new Map(owner);
for(const layer of [...COMPONENT_ROOTS,'platform/host/modules'])for(const name of readdirSync(layer)){
 const dir=`${layer}/${name}`;
 if(layer!=='platform/host/modules'&&!statSync(join(layer,name)).isDirectory())continue;
 if(name==='index.ts')continue;
 if(!owner.has(dir))problems.push(`${dir} belongs to no feature in docs/UI-CORE-PLATFORM.md#features.`);
 owner.delete(dir);
}
for(const dir of owner.keys())problems.push(`${dir} is listed in docs/UI-CORE-PLATFORM.md#features but does not exist.`);
// Every ui/, agent/, context/ and platform/ folder belongs to one of the four layers (docs/UI-CORE-PLATFORM.md#folders-by-layer):
// ui/ is UI, agent/ is Agent, context/ is Context and platform/ is Platform (#681).
const LAYERS:Record<string,{label:RegExp,roots:string[]}>={UI:{label:/^UI$/,roots:['ui']},Agent:{label:/^Agent\b/,roots:['agent']},Context:{label:/^Context\b/,roots:['context']},Platform:{label:/^Platform$/,roots:['platform']}};
const layerStart=doc.indexOf('### Folders by layer'),layerEnd=doc.indexOf('\n## ',layerStart+1);
if(layerStart<0)problems.push('docs/UI-CORE-PLATFORM.md has no "Folders by layer" section.');
const layerOf=new Map<string,string>();
for(const line of doc.slice(layerStart,layerEnd).split('\n').filter(line=>/^\| [A-Z]/.test(line)&&!line.startsWith('| Layer |'))){
 const label=line.split('|')[1].trim();
 const layer=Object.entries(LAYERS).find(([,rule])=>rule.label.test(label))?.[0];
 if(!layer){problems.push(`Folders by layer: "${label}" is not UI, Agent, Context or Platform.`);continue;}
 for(const [,dir] of line.matchAll(/`((?:ui|agent|context|platform)\/[a-z-]+)\/`/g)){
  if(layerOf.has(dir))problems.push(`${dir} is in two layers (${layerOf.get(dir)} and ${layer}).`);
  else if(!LAYERS[layer].roots.some(root=>dir.startsWith(root+'/')))problems.push(`${dir} cannot be in ${layer}: that layer is ${LAYERS[layer].roots.join('/ or ')}/.`);
  layerOf.set(dir,layer);
 }
}
for(const root of [...COMPONENT_ROOTS,'platform'])for(const name of readdirSync(root)){
 const dir=`${root}/${name}`;
 if(!statSync(dir).isDirectory())continue;
 if(!layerOf.has(dir))problems.push(`${dir} is in no layer in docs/UI-CORE-PLATFORM.md#folders-by-layer.`);
 layerOf.delete(dir);
}
for(const dir of layerOf.keys())problems.push(`${dir} is in docs/UI-CORE-PLATFORM.md#folders-by-layer but does not exist.`);
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`Feature map: every ui/, agent/ and context/ component and Electron host module belongs to one of ${FEATURES.length} components, and every ui/, agent/, context/ and platform/ folder is in one layer.`);
