import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
import {parseBuildThemeManifest,parseThemePresentation,themeAssetPath} from '../ui/themes/build-theme-contract.ts';

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
 const compiler=ts.createCompilerHost(options),originalRead=compiler.readFile,originalExists=compiler.fileExists;
 compiler.fileExists=file=>file===virtual||originalExists(file);
 compiler.readFile=file=>file===virtual?"import theme from './entry.ts'; import type {BuildTheme} from '@worldlet/theme'; const checked:BuildTheme=theme;":originalRead(file);
 const program=ts.createProgram([virtual],options,compiler),diagnostics=ts.getPreEmitDiagnostics(program);
 if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>source,getCanonicalFileName:f=>f,getNewLine:()=>"\n"}));

 return {manifest,files,hashes};
}
/** Copy an explicitly selected, trusted development source package. It is compiled, never evaluated here. */
export async function importBuildTheme(source:string,root:string){
 const checked=await validateBuildTheme(source),parent=path.join(root,'ui'),dest=path.join(parent,'selected-theme');
 const stage=path.join(parent,'.theme-stage-'+randomUUID()),backup=path.join(parent,'.theme-backup-'+randomUUID());
 let moved=false;
 try{
  await fs.mkdir(stage,{recursive:true});
  for(const file of checked.files){const target=path.join(stage,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(source,file),target);}
  // Revalidate the staged bytes, catching source edits made during copying.
  const staged=await validateBuildTheme(stage);
  if(JSON.stringify(staged.hashes)!==JSON.stringify(checked.hashes))throw Error('Theme changed during import; retry');
  await fs.writeFile(path.join(stage,'index.ts'),"export {default} from './entry.ts';\nexport {default as manifest} from './theme.json' with {type:'json'};\nexport {default as presentation} from './presentation.json' with {type:'json'};\n");
  await fs.writeFile(path.join(stage,'source-lock.json'),JSON.stringify({contractVersion:2,id:checked.manifest.id,version:checked.manifest.version,sha256:checked.hashes},null,2)+'\n');
  try{await fs.rename(dest,backup);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await fs.rename(stage,dest);}catch(error){if(moved)await fs.rename(backup,dest);throw error;}
  if(moved)await fs.rm(backup,{recursive:true});
 }finally{await fs.rm(stage,{recursive:true,force:true});}
 return checked.manifest;
}
export async function buildThemeSource(root:string,output:string){
 const source=path.join(root,'ui/selected-theme'),checked=await validateBuildTheme(source);
 const manifest=checked.manifest;
 const entry=await fs.readFile(path.join(source,'theme.css'),'utf8');
 await fs.mkdir(path.join(output,'theme-assets'),{recursive:true});
 // The output directory belongs solely to the selected package; stale assets cannot survive a replacement.
 await fs.rm(path.join(output,'theme-assets'),{recursive:true,force:true});
 await fs.mkdir(path.join(output,'theme-assets'),{recursive:true});
 for(const file of checked.files.filter(f=>f.startsWith('assets/'))){const dest=path.join(output,'theme-assets',file.slice(7));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(source,file),dest);}
 await fs.writeFile(path.join(output,'selected-theme.json'),JSON.stringify(manifest,null,2)+'\n');
 return entry;
}
if(process.argv[1]&&await fs.realpath(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,source]=process.argv.slice(2);
 if(!source||!['check','import'].includes(command))throw Error('Usage: node scripts/build-theme-source.ts check|import /path/to/themes/<id>/package');
 const root=fileURLToPath(new URL('../',import.meta.url));
 console.log(command==='import'?await importBuildTheme(path.resolve(source),root):(await validateBuildTheme(path.resolve(source))).manifest);
}
