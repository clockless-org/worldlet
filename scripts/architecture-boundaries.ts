import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=process.cwd();
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
const layers=['platform/bridge','ui','core','contracts','models','harness','platform','website','worker'];
const allowed:Record<string,string[]>={
 ui:['ui','core','contracts','platform/bridge','resources'],
 core:['core','contracts'], contracts:['contracts'],
 'platform/bridge':['platform/bridge','core','contracts'],
 'models':['models','contracts','core'],
 harness:['harness','contracts'], platform:['platform','platform/bridge','core','contracts'],
 website:['website','ui','core','contracts','resources','platform/bridge'],
 worker:['worker','core','contracts'],
};
// Exact legacy edges, deliberately visible in review. No directory-wide exemption.
const exceptions=new Map([
 ['website/analytics.ts -> platform/electron/distribution/Analytics.json','The website and the desktop app share one public analytics config.'],
 
 ['platform/bridge/world-tool-runtime.ts -> ui/shell/index.ts','Host tool dispatcher invokes the public semantic World UI.'],
 ['platform/bridge/agent-client.ts -> ui/companion/index.ts','Presentation status copy is still exported by Companion.'],
]);
const used=new Set<string>();
function layer(file:string){return layers.find(x=>file.startsWith(x+'/'))??file.split('/')[0];}
export function checkEdge(file:string,target:string){
 const edge=`${file} -> ${target}`;
 if(exceptions.has(edge)){used.add(edge);return;}
 assert(allowed[layer(file)]?.includes(layer(target)),`Forbidden layer dependency: ${edge}`);
 const component=/^(core|ui)\/([^/]+)\/(.+)$/.exec(target);
 if(component&&!file.startsWith(`${component[1]}/${component[2]}/`))
  assert.equal(component[3],'index.ts',`${file} bypasses public component entry: ${target}`);
}
export function checkSource(file:string,source:string){
 if(layer(file)==='ui') {
  assert(!/messageHandlers\s*(?:\?\.)?\s*\.?(?:worldlet|\[)|chrome\.webview/.test(source),`${file}: UI must use the Host bridge`);
  assert(!/platform\s*[!=]==?\s*['"](?:windows|macos)['"]/.test(source),`${file}: UI must use capabilities, not OS branches`);
 }
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 function dependency(specifier:string){
  const resolved=ts.resolveModuleName(specifier,path.resolve(root,file),options,ts.sys).resolvedModule;
  if(resolved&&!resolved.isExternalLibraryImport&&!resolved.resolvedFileName.includes('/node_modules/')){
   const target=path.relative(root,fs.realpathSync(resolved.resolvedFileName)).split(path.sep).join('/');
   checkEdge(file,target);return;
  }
  assert(!specifier.startsWith('.')&&!specifier.startsWith('/')&&!layers.some(x=>specifier.startsWith(x+'/')),`${file}: unresolved local dependency ${specifier}`);
  assert(!['core','contracts'].includes(layer(file)),`${file}: pure layer cannot import external module ${specifier}`);
 }
 assert.equal(ast.referencedFiles.length,0,`${file}: use explicit module imports instead of reference paths`);
 function visit(node:ts.Node){
  if(['core','contracts'].includes(layer(file))&&ts.isIdentifier(node)&&['window','document','navigator','process','require'].includes(node.text))assert.fail(`${file}: pure layer cannot use host global ${node.text}`);
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text);
  if(ts.isImportEqualsDeclaration(node))assert.fail(`${file}: import-equals is not allowed; use ESM`);
  if(ts.isIdentifier(node)&&node.text==='require')assert.fail(`${file}: require is not allowed; use ESM`);
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
   assert(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]),`${file}: computed imports are not allowed`);
   dependency((node.arguments[0] as ts.StringLiteral).text);
  }
  if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))dependency(node.argument.literal.text);
  ts.forEachChild(node,visit);
 }
 visit(ast);
}
function scan(dir:string){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=`${dir}/${entry.name}`;
  if(entry.isDirectory()){if(!['node_modules','dist','.venv','__pycache__'].includes(entry.name))scan(file);}
  else if(/\.(ts|tsx|js|mjs)$/.test(file))checkSource(file,fs.readFileSync(file,'utf8'));
 }
}
export function checkRepository(){
 // The open-source export (scripts/oss-export.mjs) leaves out the hosted services, so a missing root is skipped.
 for(const dir of ['ui','core','contracts','platform/bridge','platform/electron','website','models','worker','harness'])if(fs.existsSync(dir))scan(dir);
 for(const edge of exceptions.keys())assert(used.has(edge)||!fs.existsSync(edge.split(' -> ')[0]),`Remove stale architecture exception: ${edge}`);
}
