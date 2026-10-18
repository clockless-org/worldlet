// Every ui/, agent/, context/ and core/ component, and every Electron host module, belongs to exactly one feature row in
// docs/UI-CORE-PLATFORM.md#features (World, Applets, Companion, Attention, Tasks, Artifacts & Journal, Agents & Gate,
// Context, Connectors, Windows, Base).
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
const FEATURES=['World','Applets','Companion','Attention','Tasks','Artifacts & Journal','Agents & Gate','Context','Connectors','Windows','Base'];
const doc=readFileSync('docs/UI-CORE-PLATFORM.md','utf8');
const start=doc.indexOf('## Features and the base'),end=doc.indexOf('\n## ',start+1);
if(start<0)throw Error('docs/UI-CORE-PLATFORM.md has no "Features and the base" section.');
const rows=doc.slice(start,end).split('\n').filter(line=>FEATURES.some(feature=>line.startsWith(`| ${feature} |`)));
const found=rows.map(row=>row.split('|')[1].trim());
if(found.join('\n')!==FEATURES.join('\n'))throw Error(`Expected the feature rows ${FEATURES.join(', ')}; found ${found.join(', ')}.`);
// core/ is moving into agent/ and context/ (#681). A core/ folder left with only re-exports of its new place is not a
// component of its own any more, so no row lists it.
const COMPONENT_ROOTS=['ui','agent','context','core'].filter(root=>existsSync(root));
const shim=(dir:string)=>{
 if(!dir.startsWith('core/'))return false;
 const files:string[]=[];const walk=(at:string)=>{for(const name of readdirSync(at)){const file=join(at,name);if(statSync(file).isDirectory())walk(file);else files.push(file);}};walk(dir);
 return files.length>0&&files.every(file=>/\.ts$/.test(file)&&readFileSync(file,'utf8').split('\n').every(line=>!line.trim()||line.startsWith('//')||/^export (?:\*|\{[^}]*\}|type \{[^}]*\}|\* as \w+) from '\.\.\/(?:\.\.\/)+(?:agent|context)\//.test(line)));
};
const owner=new Map<string,string>(),problems:string[]=[];
for(const row of rows){
 const feature=row.split('|')[1].trim();
 for(const [,dir] of row.matchAll(/`((?:ui|core|agent|context)\/[a-z-]+|platform\/electron\/src\/modules\/[a-z-]+(?:\.ts)?)\/?`/g)){
  if(owner.has(dir))problems.push(`${dir} is listed under ${owner.get(dir)} and ${feature}.`);
  owner.set(dir,feature);
 }
}
const featureOf=new Map(owner);
for(const layer of [...COMPONENT_ROOTS,'platform/electron/src/modules'])for(const name of readdirSync(layer)){
 const dir=`${layer}/${name}`;
 if(layer!=='platform/electron/src/modules'&&!statSync(join(layer,name)).isDirectory())continue;
 if(name==='index.ts'||shim(dir))continue;
 if(!owner.has(dir))problems.push(`${dir} belongs to no feature in docs/UI-CORE-PLATFORM.md#features.`);
 owner.delete(dir);
}
for(const dir of owner.keys())problems.push(`${dir} is listed in docs/UI-CORE-PLATFORM.md#features but does not exist.`);
// The architecture diagram's lanes (docs/architecture.html) are the same features: every ui/ and core/ component sits in
// exactly one diagram component, in the lane its feature names.
const html=readFileSync('docs/architecture.html','utf8');
const lanes=new Map([...html.matchAll(/^ (\w+):\{title:'([^']+)'/gm)].map(([,key,title])=>[key,title]));
if([...lanes.values()].join('\n')!==FEATURES.join('\n'))problems.push(`docs/architecture.html lanes are ${[...lanes.values()].join(', ')}, not ${FEATURES.join(', ')}.`);
const drawn=new Map<string,string>();
for(const [,id,folders,lane] of html.matchAll(/^ (\w+):\['[^']*','[^']*','([^']*)',.*,'(\w+)'\],?$/gm)){
 const feature=lanes.get(lane);
 if(!feature){problems.push(`docs/architecture.html component ${id} names no lane (${lane}).`);continue;}
 for(const [,dir] of folders.matchAll(/(?<![\w/])((?:ui|core|agent|context)\/[a-z-]+)\//g)){
  if(drawn.has(dir))problems.push(`${dir} is drawn twice in docs/architecture.html.`);
  drawn.set(dir,feature);
  if(featureOf.get(dir)!==feature)problems.push(`docs/architecture.html draws ${dir} in the ${feature} lane; docs/UI-CORE-PLATFORM.md#features lists it under ${featureOf.get(dir)??'no feature'}.`);
 }
}
for(const [dir] of featureOf)if(!dir.startsWith('platform/')&&!drawn.has(dir))problems.push(`${dir} is not drawn in docs/architecture.html.`);
// Every ui/, core/ and platform/ folder belongs to one of the four layers (docs/UI-CORE-PLATFORM.md#folders-by-layer):
// ui/ is UI, platform/ is Platform, and each core/ folder is Agent (moving to agent/) or Context (moving to context/), or one of
// the folders split between them file by file (#681).
const LAYERS:Record<string,{label:RegExp,roots:string[]}>={UI:{label:/^UI$/,roots:['ui']},Agent:{label:/^Agent\b/,roots:['agent','core']},Context:{label:/^Context\b/,roots:['context','core']},Split:{label:/^Agent and Context\b/,roots:['core']},Platform:{label:/^Platform$/,roots:['platform']}};
const layerStart=doc.indexOf('### Folders by layer'),layerEnd=doc.indexOf('\n## ',layerStart+1);
if(layerStart<0)problems.push('docs/UI-CORE-PLATFORM.md has no "Folders by layer" section.');
const layerOf=new Map<string,string>();
for(const line of doc.slice(layerStart,layerEnd).split('\n').filter(line=>/^\| [A-Z]/.test(line)&&!line.startsWith('| Layer |'))){
 const label=line.split('|')[1].trim();
 const layer=LAYERS.Split.label.test(label)?'Split':Object.entries(LAYERS).find(([,rule])=>rule.label.test(label))?.[0];
 if(!layer){problems.push(`Folders by layer: "${label}" is not UI, Agent, Context or Platform.`);continue;}
 for(const [,dir] of line.matchAll(/`((?:ui|agent|context|core|platform)\/[a-z-]+)\/`/g)){
  if(layerOf.has(dir))problems.push(`${dir} is in two layers (${layerOf.get(dir)} and ${layer}).`);
  else if(!LAYERS[layer].roots.some(root=>dir.startsWith(root+'/')))problems.push(`${dir} cannot be in ${layer}: that layer is ${LAYERS[layer].roots.join('/ or ')}/.`);
  layerOf.set(dir,layer);
 }
}
for(const root of [...COMPONENT_ROOTS,'platform'])for(const name of readdirSync(root)){
 const dir=`${root}/${name}`;
 if(!statSync(dir).isDirectory()||shim(dir))continue;
 if(!layerOf.has(dir))problems.push(`${dir} is in no layer in docs/UI-CORE-PLATFORM.md#folders-by-layer.`);
 layerOf.delete(dir);
}
for(const dir of layerOf.keys())problems.push(`${dir} is in docs/UI-CORE-PLATFORM.md#folders-by-layer but does not exist.`);
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`Feature map: every ui/ and core/ component and Electron host module belongs to one of ${FEATURES.length} features, drawn in its lane in docs/architecture.html, and every ui/, core/ and platform/ folder is in one layer.`);
