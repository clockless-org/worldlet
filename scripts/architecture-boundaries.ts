import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=process.cwd();
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
// Agent and Context (#681): context/ imports only itself and contracts/, agent/ imports context/ and contracts/.
const layers=['api','platform/bridge','platform/web','ui','agent','context','contracts','models','harness','platform','website','worker'];
const PURE=['agent','context','contracts'];
const allowed:Record<string,string[]>={
 // api/ is what the operations repository uses (api/README.md): it reaches into any layer, and nothing here imports it.
 api:['api','ui','agent','context','contracts','platform','platform/bridge','platform/web','resources'],
 // platform/web is the window protocol (pairing, sealing, what each window is sent) and the browser page; the World page
 // feeds paired windows, so UI and the bridge use it.
 ui:['ui','agent','context','contracts','platform/bridge','platform/web','resources'],
 agent:['agent','context','contracts'], context:['context','contracts'],
 contracts:['contracts'],
 'platform/bridge':['platform/bridge','platform/web','agent','context','contracts'],
 'platform/web':['platform/web','agent','context','contracts'],
 'models':['models','contracts','agent','context'],
 harness:['harness','contracts'], platform:['platform','platform/bridge','platform/web','agent','context','contracts'],
 website:['website','ui','agent','context','contracts','resources','platform/bridge'],
 worker:['worker','agent','context','contracts'],
};
// Exact legacy edges, deliberately visible in review. No directory-wide exemption.
const exceptions=new Map([
 ['website/analytics.ts -> platform/desktop/distribution/Analytics.json','The website and the desktop app share one public analytics config.'],
 
 ['platform/bridge/world-tool-runtime.ts -> ui/frame/index.ts','Host tool dispatcher invokes the public semantic World UI.'],
 ['platform/bridge/agent-client.ts -> ui/companion/index.ts','Presentation status copy is still exported by Companion.'],
 ['context/connectors/services/presets.ts -> agent/gate/index.ts','A board preset of the agents source reads Agent reports with the reports\' own reader (#681).'],
 ['context/connectors/service-sync.ts -> agent/tasks/index.ts','Service sync keeps Synced Context fresh on the shared source-check schedule, which Tasks owns (#681).'],
]);
// The one way in to Context (#676, context/store/context.ts). UI only reads Context: to change anything it hands the work
// to Agent, so it never imports a writer. Only Connectors write the Synced kind, so only context/connectors (and the Store
// that defines it) imports the Synced writer. An Agent writes only in a call the entry admitted under its Grants, and only
// the standing World tools server admits one (with the Grants and audit it injects), so only it imports `agentContext`.
const CONTEXT_WRITERS=['contextWriter','syncedWriter','connectorWriter','agentContext'];
const SYNCED_WRITERS=['syncedWriter'];
const AGENT_ADMISSION=['agentContext'],ADMITS_AGENTS='platform/host/modules/gate/world-tool-bridge.ts';
export function checkContextNames(file:string,target:string,names:readonly string[]|'*'){
 if(!target.startsWith('context/'))return;
 if(layer(file)==='ui'){
  assert(names!=='*',`${file}: UI imports Context by name, so what it reads stays visible: ${target}`);
  const writes=names.filter(name=>CONTEXT_WRITERS.includes(name));
  assert(!writes.length,`${file}: UI only reads Context; writes go through agent/ (${writes.join(', ')})`);
 }
 if(names!=='*'&&!file.startsWith('context/connectors/')&&!file.startsWith('context/store/')){
  const synced=names.filter(name=>SYNCED_WRITERS.includes(name));
  assert(!synced.length,`${file}: only context/connectors writes Synced Context (${synced.join(', ')})`);
 }
 if(file!==ADMITS_AGENTS&&!file.startsWith('context/store/')){
  const admits=names==='*'?[]:names.filter(name=>AGENT_ADMISSION.includes(name));
  assert(names!=='*'||!target.startsWith('context/store/'),`${file}: import Context's store by name, so who admits an Agent stays visible: ${target}`);
  assert(!admits.length,`${file}: only ${ADMITS_AGENTS} admits an Agent's call to Context (${admits.join(', ')})`);
 }
}
const used=new Set<string>();
function layer(file:string){return layers.find(x=>file.startsWith(x+'/'))??file.split('/')[0];}
export function checkEdge(file:string,target:string){
 const edge=`${file} -> ${target}`;
 if(exceptions.has(edge)){used.add(edge);return;}
 assert(allowed[layer(file)]?.includes(layer(target)),`Forbidden layer dependency: ${edge}`);
 const component=/^(ui|agent|context)\/([^/]+)\/(.+)$/.exec(target);
 if(component&&!file.startsWith('api/')&&!file.startsWith(`${component[1]}/${component[2]}/`))
  assert.equal(component[3],'index.ts',`${file} bypasses public component entry: ${target}`);
}
export function checkSource(file:string,source:string){
 if(layer(file)==='ui') {
  assert(!/messageHandlers\s*(?:\?\.)?\s*\.?(?:worldlet|\[)|chrome\.webview/.test(source),`${file}: UI must use the Host bridge`);
  assert(!/platform\s*[!=]==?\s*['"](?:windows|macos)['"]/.test(source),`${file}: UI must use capabilities, not OS branches`);
 }
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 function dependency(specifier:string,names?:readonly string[]|'*'){
  const resolved=ts.resolveModuleName(specifier,path.resolve(root,file),options,ts.sys).resolvedModule;
  if(resolved&&!resolved.isExternalLibraryImport&&!resolved.resolvedFileName.includes('/node_modules/')){
   const target=path.relative(root,fs.realpathSync(resolved.resolvedFileName)).split(path.sep).join('/');
   checkEdge(file,target);if(names)checkContextNames(file,target,names);return;
  }
  assert(!specifier.startsWith('.')&&!specifier.startsWith('/')&&!layers.some(x=>specifier.startsWith(x+'/')),`${file}: unresolved local dependency ${specifier}`);
  assert(!PURE.includes(layer(file)),`${file}: pure layer cannot import external module ${specifier}`);
 }
 if(file!=='api/types.d.ts')assert.equal(ast.referencedFiles.length,0,`${file}: use explicit module imports instead of reference paths`);
 function visit(node:ts.Node){
  if(PURE.includes(layer(file))&&ts.isIdentifier(node)&&['window','document','navigator','process','require'].includes(node.text))assert.fail(`${file}: pure layer cannot use host global ${node.text}`);
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text,importedNames(node));
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
/** The names an import or export declaration takes from its module (the original names, before `as`), or '*' for all. */
function importedNames(node:ts.ImportDeclaration|ts.ExportDeclaration):readonly string[]|'*' {
 if(ts.isExportDeclaration(node)){
  if(!node.exportClause)return '*';
  return ts.isNamedExports(node.exportClause)?node.exportClause.elements.map(item=>(item.propertyName??item.name).text):'*';
 }
 const clause=node.importClause;
 if(!clause)return [];
 const names=clause.name?['default']:[];
 const bindings=clause.namedBindings;
 if(bindings&&ts.isNamespaceImport(bindings))return '*';
 if(bindings&&ts.isNamedImports(bindings))names.push(...bindings.elements.map(item=>(item.propertyName??item.name).text));
 return names;
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
 for(const dir of ['api','ui','agent','context','contracts','platform/bridge','platform/host','platform/desktop','platform/server','platform/web','website','models','worker','harness'])if(fs.existsSync(dir))scan(dir);
 for(const edge of exceptions.keys())assert(used.has(edge)||!fs.existsSync(edge.split(' -> ')[0]),`Remove stale architecture exception: ${edge}`);
}
