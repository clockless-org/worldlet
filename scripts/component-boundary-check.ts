import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Native/Python bridges consume core/index.ts. Production TypeScript consumers
// enter other Core/UI components through their explicit public APIs.
export function assertComponentImport(file:string,specifier:string) {
 if(!specifier.startsWith('.'))return;
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
 const match=/^(core|ui)\/([^/]+)\/(.+)$/.exec(target);
 if(!match||file.startsWith(`${match[1]}/${match[2]}/`))return;
 assert.equal(match[3],'index.ts',`${file} bypasses ${match[1]}/${match[2]}'s public API: ${target}`);
}
async function scan(dir:string):Promise<void>{
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const file=`${dir}/${entry.name}`;
  if(entry.isDirectory()){await scan(file);continue;}
  if(!/\.(ts|js|mjs)$/.test(file))continue;
  const ast=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node:ts.Node){
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))assertComponentImport(file,node.moduleSpecifier.text);
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
    assert(node.arguments.length>0&&ts.isStringLiteral(node.arguments[0]),`${file}: computed imports cannot enforce component boundaries`);
    assertComponentImport(file,(node.arguments[0] as ts.StringLiteral).text);
   }
   if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))assertComponentImport(file,node.argument.literal.text);
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
}
assert.throws(()=>assertComponentImport('ui/hud/example.ts','../../core/scheduling/runtime-tasks.ts'),/bypasses/);
assert.throws(()=>assertComponentImport('core/attention/example.ts','../scheduling/runtime-tasks.ts'),/bypasses/);
assertComponentImport('core/scheduling/example.ts','./runtime-tasks.ts');
assertComponentImport('ui/hud/example.ts','../../core/scheduling/index.ts');
assert.throws(()=>assertComponentImport('ui/companion/example.ts','../browser/browser-device.ts'),/bypasses/);
assert.throws(()=>assertComponentImport('website/main.ts','../ui/shell/notion-world.ts'),/bypasses/);
assertComponentImport('ui/companion/example.ts','../browser/index.ts');
assertComponentImport('ui/browser/example.ts','./browser-device.ts');
// The open-source export leaves out the hosted services (website, models, worker).
for(const root of ['ui','core','platform/bridge','website','models','worker'])if(existsSync(root))await scan(root);
console.log('PASS Core/UI public component entry points, including type and dynamic imports; internal access stays within its owner.');

// The Electron window coordinators dispatch domain operations; the World store owns persistence.
const ledgerAccess=/\bWorldLedger\b|\.ledger\s*\(|node:sqlite/;
for(const file of ['platform/electron/src/main.ts','platform/electron/src/world/window.ts']){
 const source=await readFile(file,'utf8');
 assert(!ledgerAccess.test(source),`${file} must use Store domain operations, not open the ledger`);
 assert(!/store\.state(?:\.\w+)*\s*=(?!=)|store\.state\.\w+\.(?:push|splice|pop|shift|unshift)\s*\(|store\.(?:persist|changed)\s*\(/.test(source),`${file} must mutate domain state through Store operations`);
}
console.log('PASS Electron window coordinators use Store operations and never replace, mutate or persist Store state directly.');

// Website pages report activity through the recorder; observation cannot mutate storage directly.
for(const file of ['platform/electron/src/modules/browser/page.ts','platform/electron/src/modules/browser/youtube.ts']){
 const source=await readFile(file,'utf8');
 assert(!ledgerAccess.test(source),`${file} must delegate activity persistence`);
}
console.log('PASS browser activity capture delegates storage through the recorder interface.');
