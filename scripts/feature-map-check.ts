// Every ui/ and core/ component belongs to exactly one feature row in
// docs/UI-CORE-PLATFORM.md#features (World, Applets, Companion, Attention, Base).
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
const doc=readFileSync('docs/UI-CORE-PLATFORM.md','utf8');
const start=doc.indexOf('## Four features and the base'),end=doc.indexOf('\n## ',start+1);
if(start<0)throw Error('docs/UI-CORE-PLATFORM.md has no "Four features and the base" section.');
const rows=doc.slice(start,end).split('\n').filter(line=>/^\| (World|Applets|Companion|Attention|Base) \|/.test(line));
if(rows.length!==5)throw Error(`Expected 5 feature rows, found ${rows.length}.`);
const owner=new Map<string,string>(),problems:string[]=[];
for(const row of rows){
 const feature=row.split('|')[1].trim();
 for(const [,dir] of row.matchAll(/`((?:ui|core)\/[a-z-]+)\/`/g)){
  if(owner.has(dir))problems.push(`${dir} is listed under ${owner.get(dir)} and ${feature}.`);
  owner.set(dir,feature);
 }
}
for(const layer of ['ui','core'])for(const name of readdirSync(layer)){
 const dir=`${layer}/${name}`;
 if(!statSync(join(layer,name)).isDirectory())continue;
 if(!owner.has(dir))problems.push(`${dir} belongs to no feature in docs/UI-CORE-PLATFORM.md#features.`);
 owner.delete(dir);
}
for(const dir of owner.keys())problems.push(`${dir} is listed in docs/UI-CORE-PLATFORM.md#features but does not exist.`);
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log('Feature map: every ui/ and core/ component belongs to one feature.');
