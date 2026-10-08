// Every relative import names the file that is actually there, extension included.
//
// A specifier written as './x.js' keeps resolving under esbuild and tsc when x is
// x.ts, but Node does not resolve it, and the check scripts run under Node without
// a bundler. The real extension works everywhere: tsc (with
// allowImportingTsExtensions), esbuild, and Node's own type stripping. Without
// --check, this rewrites specifiers after a rename; with it, check:source fails on a
// stale one.
//
// Run: node scripts/ts-specifiers.ts [--check]
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const ROOTS=['ui','core','contracts','platform/bridge','platform/electron','harness/hermes','resources','models','worker','scripts','website'];
const CODE=new Set(['.ts','.js','.mjs']);
const SPECIFIER=/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.[^'"]*?)(['"])/g;

async function files(dir){
 const out=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(entry.name==='node_modules'||entry.name.startsWith('.'))continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())out.push(...await files(full));
  else if(CODE.has(path.extname(entry.name)))out.push(full);
 }
 return out;
}
const exists=async p=>{try{await stat(p);return true;}catch{return false;}};

// The file a specifier means, whatever extension it was written with.
async function resolve(from,specifier){
 const target=path.resolve(path.dirname(from),specifier);
 const base=target.replace(/\.(ts|js|mjs)$/,'');
 for(const extension of ['.ts','.js','.mjs','.json'])if(await exists(base+extension))return base+extension;
 if(await exists(target))return target;
 return null;
}

const changes=[];
for(const dir of ROOTS){
 if(!await exists(path.join(root,dir)))continue;
 for(const file of await files(path.join(root,dir))){
  const source=await readFile(file,'utf8');
  let touched=false;
  const next=await replaceAsync(source,SPECIFIER,async(whole,lead,open,specifier,close)=>{
   const target=await resolve(file,specifier);
   if(!target)return whole;
   // Import specifiers use '/' on every OS; path.relative gives '\\' on Windows.
   const wanted='./'+path.relative(path.dirname(file),target).split(path.sep).join('/');
   const written=wanted.startsWith('./..')?wanted.slice(2):wanted;
   if(written===specifier)return whole;
   touched=true;
   return lead+open+written+close;
  });
  if(touched){changes.push(path.relative(root,file));if(!process.argv.includes('--check'))await writeFile(file,next);}
 }
}
async function replaceAsync(text,pattern,replacer){
 const parts=[];let last=0;
 for(const match of text.matchAll(pattern)){
  parts.push(text.slice(last,match.index),await replacer(...match));
  last=match.index+match[0].length;
 }
 parts.push(text.slice(last));
 return parts.join('');
}
if(process.argv.includes('--check')){
 if(changes.length){console.error('Specifiers point at files that are not there:\n'+changes.join('\n'));process.exit(1);}
 console.log('PASS every relative import names the file it resolves to');
}else console.log(changes.length?'Rewrote specifiers in '+changes.length+' files':'Every specifier already names its file');
