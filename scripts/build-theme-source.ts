import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
import {parseBuildThemeManifest,parseThemePresentation,themeAssetPath} from '../ui/themes/build-theme-contract.ts';
import {withVirtualFile} from './ts-virtual-file.ts';

export async function themeFiles(root:string,prefix=''):Promise<string[]> {
 const result:string[]=[];
 for(const e of await fs.readdir(path.join(root,prefix),{withFileTypes:true})){
  if(e.isSymbolicLink())throw Error('Theme symlink is not supported');
  const p=prefix+e.name;
  if(e.isDirectory())result.push(...await themeFiles(root,p+'/'));else if(e.isFile())result.push(p);else throw Error('Unsupported theme file');
 }
 return result.sort();
}
export async function validateBuildTheme(source:string){
 source=await fs.realpath(source);
 const files=await themeFiles(source),manifest=parseBuildThemeManifest(JSON.parse(await fs.readFile(path.join(source,'theme.json'),'utf8')));
 for(const required of ['entry.ts','theme.css','presentation.json'])if(!files.includes(required))throw Error('Missing '+required);
 const presentation=parseThemePresentation(JSON.parse(await fs.readFile(path.join(source,'presentation.json'),'utf8')));
 for(const id of manifest.applets)if(!presentation.applets[id])throw Error('Missing declared applet scene: '+id);
 const assets=[presentation.world,presentation.fallback,...Object.values(presentation.applets)].map(s=>s.background);
 for(const font of presentation.fonts)assets.push(font.file,font.license);
 for(const asset of assets)if(!files.includes(themeAssetPath(asset)))throw Error('Missing theme asset: '+asset);
 const css=await fs.readFile(path.join(source,'theme.css'),'utf8');
 if(/@import\b/.test(css))throw Error('Theme CSS imports are not supported; bundle styles locally');
 for(const match of css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)){
  const asset=match[1].replace(/^theme-assets\//,'assets/');
  if(!files.includes(themeAssetPath(asset)))throw Error('Missing CSS asset: '+asset);
 }
 const hashes:Record<string,string>={};
 for(const file of files){
  if(!/\.(?:ts|css|json|png|webp|jpg|jpeg|woff2?|ttf|otf|txt|md|svg|mp3|wav|ogg|webm)$/i.test(file))throw Error('Unsupported theme file: '+file);
  const bytes=await fs.readFile(path.join(source,file));
  if(bytes.length<1024&&bytes.toString().startsWith('version https://git-lfs.github.com/spec/v1'))throw Error('Run git lfs pull before importing: '+file);
  hashes[file]=createHash('sha256').update(bytes).digest('hex');
  if(file.endsWith('.json')){
   const inspect=(value:unknown)=>{if(typeof value==='string'&&value.startsWith('assets/')){if(!files.includes(themeAssetPath(value)))throw Error('Missing declared asset: '+value);}else if(value&&typeof value==='object')Object.values(value).forEach(inspect);};
   inspect(JSON.parse(bytes.toString()));
  }
  if(file.endsWith('.ts'))for(const ref of ts.preProcessFile(bytes.toString(),true,true).importedFiles){
   if(ref.fileName==='@worldlet/theme')continue; // Value imports are rejected by the bundler below.
   if(!ref.fileName.startsWith('.'))throw Error('Theme imports only local files and public types: '+ref.fileName);
   const resolved=await fs.realpath(path.resolve(source,path.dirname(file),ref.fileName));
   if(!resolved.startsWith(source+path.sep))throw Error('Theme type or value import escapes its directory');
  }

 }
 // Compile for the browser without running the entry. Imports stay inside this source package.
 const result=await build({entryPoints:[path.join(source,'entry.ts')],bundle:true,write:false,platform:'browser',format:'esm',logLevel:'silent',plugins:[{name:'theme-boundary',setup(b){b.onResolve({filter:/.*/},async args=>{
  if(args.kind==='entry-point')return;
  if(!args.path.startsWith('.'))throw Error('Theme code imports only local modules; @worldlet/theme is type-only: '+args.path);
  const resolved=await fs.realpath(path.resolve(args.resolveDir,args.path));
  if(!resolved.startsWith(source+path.sep))throw Error('Theme import escapes its directory');
  return {path:resolved};
 });}}]});
 if(!result.outputFiles.length)throw Error('Theme entry did not compile');
 const virtual=path.join(source,'__theme_contract_check__.ts');
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noImplicitAny:false,strictNullChecks:false,noEmit:true,allowImportingTsExtensions:true,skipLibCheck:true,resolveJsonModule:true,types:[],baseUrl:source,paths:{'@worldlet/theme':[fileURLToPath(new URL('../ui/themes/build-theme-contract.ts',import.meta.url))]}};
 const compiler=withVirtualFile(ts.createCompilerHost(options),virtual,"import theme from './entry.ts'; import type {BuildTheme} from '@worldlet/theme'; const checked:BuildTheme=theme;");
 const program=ts.createProgram([virtual],options,compiler),diagnostics=ts.getPreEmitDiagnostics(program);
 if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>source,getCanonicalFileName:f=>f,getNewLine:()=>"\n"}));

 return {manifest,files,hashes};
}
const PACKAGES='ui/theme-packages';
const packageIndex="import theme from './entry.ts';\nimport manifest from './theme.json' with {type:'json'};\nimport presentation from './presentation.json' with {type:'json'};\n/** Generated by theme:import: the package as the host registry reads it. */\nexport default {theme,manifest,presentation};\n";
/** Bundled package IDs in a stable order. The default theme (Village) is built in, not a package. */
export async function bundledThemes(root:string):Promise<string[]> {
 const ids=(await fs.readdir(path.join(root,PACKAGES),{withFileTypes:true})).filter(e=>e.isDirectory()&&/^[a-z][a-z0-9-]*$/.test(e.name)).map(e=>e.name).sort();
 return ids;
}
/** The registry the app bundles (ui/theme-packages/index.ts): every package directory, nothing else to edit. */
export async function writeThemeRegistry(root:string){
 const ids=await bundledThemes(root),name=(id:string)=>'theme_'+id.replace(/-/g,'_');
 await fs.writeFile(path.join(root,PACKAGES,'index.ts'),'// Generated by `npm run theme:import`: every bundled theme package. Do not edit by hand.\n'+ids.map(id=>`import ${name(id)} from './${id}/index.ts';\n`).join('')+`export const THEME_PACKAGES=[${ids.map(name).join(',')}];\n`);
 return ids;
}
/** Copy an explicitly chosen, trusted development source package into ui/theme-packages/<id>. It is compiled, never evaluated here.
 * Other bundled themes are untouched; importing the same ID again replaces only that package. */
export async function importBuildTheme(source:string,root:string){
 const checked=await validateBuildTheme(source),parent=path.join(root,PACKAGES),dest=path.join(parent,checked.manifest.id);
 await fs.mkdir(parent,{recursive:true});
 const stage=path.join(parent,'.theme-stage-'+randomUUID()),backup=path.join(parent,'.theme-backup-'+randomUUID());
 let moved=false;
 try{
  await fs.mkdir(stage,{recursive:true});
  for(const file of checked.files.filter(f=>f!=='index.ts'&&f!=='source-lock.json')){const target=path.join(stage,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(source,file),target);}
  // Revalidate the staged bytes, catching source edits made during copying.
  const staged=await validateBuildTheme(stage);
  const hashes=(h:Record<string,string>)=>JSON.stringify(Object.entries(h).filter(([f])=>f!=='index.ts'&&f!=='source-lock.json'));
  if(hashes(staged.hashes)!==hashes(checked.hashes))throw Error('Theme changed during import; retry');
  await fs.writeFile(path.join(stage,'index.ts'),packageIndex);
  await fs.writeFile(path.join(stage,'source-lock.json'),JSON.stringify({contractVersion:2,id:checked.manifest.id,updatedAt:checked.manifest.updatedAt,sha256:staged.hashes},null,2)+'\n');
  try{await fs.rename(dest,backup);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await fs.rename(stage,dest);}catch(error){if(moved)await fs.rename(backup,dest);throw error;}
  if(moved)await fs.rm(backup,{recursive:true});
 }finally{await fs.rm(stage,{recursive:true,force:true});}
 await writeThemeRegistry(root);
 return checked.manifest;
}
/** Publish every bundled package: assets under theme-assets/<id>/, its stylesheet as theme-<id>.css and the list in themes.json. */
export async function buildThemeSource(root:string,output:string){
 const ids=await bundledThemes(root),published=[];
 // The output directory belongs solely to the bundled packages; stale assets cannot survive a replacement.
 await fs.rm(path.join(output,'theme-assets'),{recursive:true,force:true});
 for(const old of (await fs.readdir(output).catch(()=>[])).filter(f=>/^theme-[a-z0-9-]+\.css$/.test(f)))await fs.rm(path.join(output,old));
 for(const id of ids){
  const source=path.join(root,PACKAGES,id),checked=await validateBuildTheme(source);
  if(checked.manifest.id!==id)throw Error(`Theme package ${id} declares id ${checked.manifest.id}`);
  for(const file of checked.files.filter(f=>f.startsWith('assets/'))){const dest=path.join(output,'theme-assets',id,file.slice(7));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(source,file),dest);}
  const css=(await fs.readFile(path.join(source,'theme.css'),'utf8')).replace(/(url\(\s*['"]?)theme-assets\//g,`$1theme-assets/${id}/`);
  await fs.writeFile(path.join(output,`theme-${id}.css`),css);
  published.push({id,title:checked.manifest.title,updatedAt:checked.manifest.updatedAt});
 }
 await fs.writeFile(path.join(output,'themes.json'),JSON.stringify(published,null,2)+'\n');
 return published;
}
if(process.argv[1]&&await fs.realpath(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,source]=process.argv.slice(2);
 if(!source||!['check','import'].includes(command))throw Error('Usage: node scripts/build-theme-source.ts check|import /path/to/<id>/package');
 const root=fileURLToPath(new URL('../',import.meta.url));
 console.log(command==='import'?await importBuildTheme(path.resolve(source),root):(await validateBuildTheme(path.resolve(source))).manifest);
}
