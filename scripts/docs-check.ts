import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const trackedFiles=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0'))].filter(f=>f&&existsSync(f)&&statSync(f).isFile()).sort();
const supportRoots=['docs/','resources/styles/builtin/references/','platform/distribution/','gatehouse/preview/'];
const isSupport=(file:string)=>supportRoots.some(root=>file.startsWith(root))||file==='core/diagnostics/analytics-insights.json';
const files=trackedFiles.filter(f=>f.endsWith('.md'));
const errors:string[]=[];
// Keep the complete inventory in the documentation index, so the README stays a short
// front page. Generated asset binaries outside docs/ are represented by their resource documentation.
const indexPath='docs/README.md';
const startMarker='<!-- documentation-inventory:start -->';
const endMarker='<!-- documentation-inventory:end -->';
const groups:[string,string[]][]=[
 ['Root entry points',[]],
 ['Product, architecture and operations guides',[]],
 ['Applet runtime descriptions',[]],
 ['UI and Applet authoring references',[]],
 ['Resource and artwork records',[]],
 ['Module and service documentation',[]],
 ['Website documentation and articles',[]],
 ['Documentation diagrams, previews and evidence',[]],
];
for(const file of trackedFiles){
 if(!file.endsWith('.md')&&!isSupport(file))continue;
 const group=!file.endsWith('.md')?7:!file.includes('/')?0:
  file.startsWith('docs/')?1:/^ui\/applets\/[^/]+\/applet\.md$/.test(file)?2:
  file.startsWith('ui/')?3:file.startsWith('resources/')?4:
  file.startsWith('website/')?6:5;
 groups[group][1].push(file);
}
const total=groups.reduce((sum,[,entries])=>sum+entries.length,0);
const lines=[`Indexed: **${files.length} Markdown documents** and **${total-files.length} supporting documentation files**.`,
 '', '| Category | Files |', '| --- | ---: |',
 ...groups.map(([title,entries])=>`| ${title} | ${entries.length} |`), ''];
for(const [title,entries] of groups){
 lines.push(`<details><summary>${title} (${entries.length})</summary>`, '',
  ...entries.map(file=>`- [${file}](${path.posix.relative(path.posix.dirname(indexPath),file).split('/').map(encodeURIComponent).join('/')})`),
  '', '</details>', '');
}
const inventory=lines.join('\n');
if(!existsSync(indexPath))errors.push('Missing documentation index: '+indexPath);
else{
 // Windows checkouts with core.autocrlf use CRLF; the generated inventory uses LF.
 const source=readFileSync(indexPath,'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf(startMarker),end=source.indexOf(endMarker);
 if(start<0||end<=start)errors.push(indexPath+': missing inventory markers');
 else{
  const expected=source.slice(0,start+startMarker.length)+'\n\n'+inventory+'\n'+source.slice(end);
  if(process.argv.includes('--write-index'))writeFileSync(indexPath,expected);
  else if(source!==expected)errors.push(indexPath+': inventory is stale; run node scripts/docs-check.ts --write-index');
 }
}
// GitHub heading slugs: lowercase, drop punctuation, spaces become hyphens and
// repeated slugs gain -1, -2. Explicit id attributes are stable aliases.
const anchorCache=new Map<string,Set<string>>();
const anchorsOf=(file:string)=>{
 let anchors=anchorCache.get(file);if(anchors)return anchors;
 anchors=new Set();const seen=new Map<string,number>();let fence='';
 for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
  const marker=line.match(/^\s*(`{3,}|~{3,})/)?.[1];
  if(marker){if(!fence)fence=marker[0];else if(marker[0]===fence)fence='';continue;}
  if(fence)continue;
  for(const id of line.matchAll(/\b(?:id|name)="([^"]+)"/g))anchors.add(id[1]);
  const heading=line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)?.[1];if(heading===undefined)continue;
  const base=heading.replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,'').toLowerCase()
   .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu,'').replace(/\s/g,'-');
  const count=seen.get(base)??0;seen.set(base,count+1);anchors.add(count?base+'-'+count:base);
 }
 anchorCache.set(file,anchors);return anchors;
};
for(const file of files){
 const source=readFileSync(file,'utf8');
 for(const match of source.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)){
  const url=match[1];if(/^[a-z][a-z0-9+.-]*:/i.test(url))continue;
  const hash=url.includes('#')?decodeURIComponent(url.slice(url.indexOf('#')+1)):'';
  const target=decodeURIComponent(url.split('#')[0].split('?')[0]);
  if(!target){if(hash&&!anchorsOf(file).has(hash))errors.push(file+': '+url+' (missing anchor)');continue;}
  // Website Markdown is published under the site root. A /blog/images/... URL
  // names a website asset, not an absolute file at the filesystem root.
  const resolved=file.startsWith('website/')&&target.startsWith('/')
   ?path.resolve('website','.'+target):path.resolve(path.dirname(file),target);
  if(!existsSync(resolved))errors.push(file+': '+url);
  else if(hash&&resolved.endsWith('.md')&&!anchorsOf(path.relative('.',resolved)).has(hash))errors.push(file+': '+url+' (missing anchor)');
 }
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('PASS local Markdown targets and anchors ('+files.length+' documents); remote URLs and HTML anchors are not checked');
