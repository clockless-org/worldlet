import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateBuildTheme,importBuildTheme,buildThemeSource} from './build-theme-source.ts';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'worldlet-theme-contract-'));
try{
 const manifest={contractVersion:1,id:'first',version:'1.0.0',title:'First',entry:'entry.ts',stylesheet:'theme.css',assets:'assets',inherits:'village',hud:'shared',fonts:'shared',buttons:'styled',applets:[]};
 const source=path.join(tmp,'source'),consumer=path.join(tmp,'consumer');await fs.mkdir(path.join(source,'assets'),{recursive:true});await fs.mkdir(path.join(consumer,'ui'),{recursive:true});
 const write=async(id:string)=>{await fs.writeFile(path.join(source,'theme.json'),JSON.stringify({...manifest,id}));await fs.writeFile(path.join(source,'entry.ts'),`import type {BuildTheme} from '@worldlet/theme'; const theme:BuildTheme={contractVersion:1,id:'${id}',renderApplet:()=>false};export default theme;`);await fs.writeFile(path.join(source,'theme.css'),`:root{--theme-ink:#123456}`);};
 await write('first');await fs.writeFile(path.join(source,'assets','test.txt'),'fixture');
 await importBuildTheme(source,consumer);const initial=await fs.readFile(path.join(consumer,'ui/selected-theme/source-lock.json'),'utf8');
 await importBuildTheme(source,consumer);assert.equal(await fs.readFile(path.join(consumer,'ui/selected-theme/source-lock.json'),'utf8'),initial);
 await fs.writeFile(path.join(source,'theme.json'),JSON.stringify({...manifest,contractVersion:99}));await assert.rejects(importBuildTheme(source,consumer),/Invalid build theme/);assert.equal(await fs.readFile(path.join(consumer,'ui/selected-theme/source-lock.json'),'utf8'),initial);
 await write('second');await importBuildTheme(source,consumer);assert.equal(JSON.parse(await fs.readFile(path.join(consumer,'ui/selected-theme/theme.json'),'utf8')).id,'second');
 const output=path.join(tmp,'output');await fs.mkdir(path.join(output,'theme-assets'),{recursive:true});await fs.writeFile(path.join(output,'theme-assets','stale.txt'),'old');assert.match(await buildThemeSource(consumer,output),/123456/);await assert.rejects(fs.stat(path.join(output,'theme-assets/stale.txt')));assert.equal(await fs.readFile(path.join(output,'theme-assets/test.txt'),'utf8'),'fixture');
 await fs.writeFile(path.join(source,'entry.ts'),"import fs from 'node:fs';export default fs");await assert.rejects(validateBuildTheme(source),/Theme (?:code )?imports only local/);
 await fs.writeFile(path.join(source,'entry.ts'),"export default {contractVersion:1,id:'bad',renderApplet:()=>true}");await assert.rejects(validateBuildTheme(source),/not assignable/);
 await write('second');await fs.writeFile(path.join(tmp,'private.ts'),'export type Private=string');await fs.appendFile(path.join(source,'entry.ts'),"\nimport type {Private} from '../private.ts';");await assert.rejects(validateBuildTheme(source),/import escapes/);
 await write('second');await fs.symlink(path.join(source,'theme.json'),path.join(source,'assets','escape.json'));await assert.rejects(validateBuildTheme(source),/symlink/);
 console.log('PASS build theme contract: typed source, duplicate, replacement, failed import preservation, asset cleanup, version and boundary rejection');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
