import assert from 'node:assert/strict';
import {bundleScript,withBrowser} from './browser-test.ts';

const bundle=await bundleScript({entryPoints:['ui/companion/fox-preferences.ts'],globalName:'Preferences'});
await withBrowser(async browser=>{
 const page=await browser.newPage();
 await page.setContent('<section id="guide"></section>');
 await page.addScriptTag({content:bundle});
 await page.evaluate(async()=>{
  window.calls=[];
  const view={setGuide(value){const body=document.getElementById('guide');body.textContent=value?.text||'';body.append(...value?.actions||[]);}};
  const call=async(action,args:{operation?:string}={})=>{
   if(action==='foxPreferences')return {platform:'windows',model:{name:'Fixture'}};
   window.calls.push({action,...args});
   if(args.operation==='choose')return {id:'reviewed-archive',name:'Nova',memories:2,messages:4};
   return {ok:true};
  };
  await (window as any).Preferences.createFoxPreferences({call,view}).show('companion-transfer');
 });
 await page.getByRole('button',{name:'Import companion',exact:true}).click();
 await page.getByRole('button',{name:'Use this companion',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.calls.some(row=>row.operation==='import')),false);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.calls.map(row=>row.operation)),['choose','cancel']);
 await page.getByRole('button',{name:'Import companion',exact:true}).click();
 await page.getByRole('button',{name:'Use this companion',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.calls.filter(row=>row.operation==='import')),[{action:'companionArchive',operation:'import',id:'reviewed-archive'}]);
 console.log('PASS companion transfer: selection is reviewed, cancellation clears it, confirmation imports only the reviewed ID once.');
});
