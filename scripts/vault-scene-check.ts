import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveVaultNote,vaultWikiLinks} from '../core/applets/index.ts';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';
const ids=['Projects/Navigation.md','Projects/Applets.md','Research/Library references.md','One/Same.md','Two/Same.md'];
assert.equal(resolveVaultNote('Applets','Projects/Navigation.md',ids),'Projects/Applets.md');
assert.equal(resolveVaultNote('../Research/Library%20references#Section','Projects/Navigation.md',ids),'Research/Library references.md');
for(const target of ['Same','Missing','../../escape','/Projects/Applets','https://example.com/','%2fProjects/Applets'])assert.equal(resolveVaultNote(target,'Projects/Navigation.md',ids),null);
assert.equal(resolveVaultNote('100%25%20done.md','',['100% done.md']),'100% done.md');
const found=vaultWikiLinks('[[Applets|Applications]]\n`[[Missing]]`\n```md\n[[Missing]]\n```\n![[image]]\n[[Library references]]','Projects/Navigation.md',ids);assert.deepEqual(found.map(l=>l.id),['Projects/Applets.md','Research/Library references.md']);assert.equal(found[0].label,'Applications');
const script=await bundleScript({stdin:{contents:"export {mountAppletScene,renderVaultScene} from './ui/applets/index.ts';",resolveDir:process.cwd(),loader:'ts'},globalName:'VaultScene'});
const css=(await Promise.all(['ui/applets/scene/applet-scene.css','ui/applets/obsidian/open.css'].map(p=>readFile(p,'utf8')))).join('\n');
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844}}),errors=pageErrors(page);await page.setContent('<title>Vault scene fixture</title><style>'+css+'body{margin:0}#notionWorld{position:fixed;inset:0}</style><main id="notionWorld"></main>');await page.addScriptTag({content:script});
 await page.evaluate(()=>{
  const w=window as any;w.pending={};w.calls=[];const reg=(id,role,rect)=>({id,role,rect,material:'paper'});
  w.scene=w.VaultScene.mountAppletScene(document.querySelector('#notionWorld'),'obsidian',{source:{registration:{imageSize:[1500,844],sha256:'0'.repeat(64),regions:[reg('main','primary',[.4,.25,.4,.6]),reg('vault-index','secondary',[.1,.25,.25,.5]),reg('vault-links','secondary',[.82,.25,.16,.6]),reg('vault-heading','secondary',[.1,.05,.8,.08]),reg('vault-toolbar','secondary',[.1,.15,.8,.07])],companion:[.4,.9,.35,.05]}}});
  w.value={connected:true,vault:{pages:[{id:'Projects/Navigation.md',title:'Navigation'},{id:'Projects/Applets.md',title:'Applets'}],choose:()=>w.calls.push('choose'),disconnect:()=>w.calls.push('disconnect'),read:id=>new Promise((resolve,reject)=>w.pending[id]={resolve,reject}),renderMarkdown:text=>Object.assign(document.createElement('p'),{textContent:text})}};
  w.VaultScene.renderVaultScene(w.scene.primary.element,{title:'Obsidian'},[],w.value,w.scene.regions);
 });
 await page.getByRole('button',{name:'Applets.md',exact:true}).click();await page.evaluate(()=>(window as any).pending['Projects/Applets.md'].resolve({text:'Current note'}));await page.getByText('Current note',{exact:true}).waitFor();await page.evaluate(()=>(window as any).pending['Projects/Navigation.md'].resolve({text:'Stale note'}));assert.equal(await page.getByText('Stale note',{exact:true}).count(),0);
 await page.getByLabel('Find a vault note',{exact:true}).fill('Navigation');assert.equal(await page.locator('.vault-note').count(),1);assert.equal(await page.getByText('Current note',{exact:true}).count(),1);
 await page.locator('.vault-note').click();await page.evaluate(()=>(window as any).pending['Projects/Navigation.md'].reject(Error('Read unavailable')));await page.getByText('Read unavailable',{exact:true}).waitFor();await page.getByRole('button',{name:'Retry',exact:true}).click();await page.evaluate(()=>(window as any).pending['Projects/Navigation.md'].resolve({text:'[[Applets]] and [[Missing]]'}));await page.getByRole('navigation',{name:'Linked notes'}).getByRole('button').waitFor();await page.getByText('Some links are missing or ambiguous.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls),[]);await page.getByRole('button',{name:'Change vault',exact:true}).click();await page.getByRole('button',{name:'Disconnect',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).calls),['choose','disconnect']);
 await page.getByLabel('Find a vault note',{exact:true}).fill('');await page.getByRole('button',{name:'Applets.md',exact:true}).click();await page.evaluate(()=>{const w=window as any;w.scene.destroy();w.pending['Projects/Applets.md'].resolve({text:'Detached note'});});assert.equal(await page.getByText('Detached note',{exact:true}).count(),0);assert.deepEqual(errors,[]);
 console.log('PASS vault scene: confined link resolution, aliases, code exclusions, stale reads, search, retry, connection actions and detached completion');
});
