import assert from 'node:assert/strict';
import {bundleScript,withBrowser} from './browser-test.ts';

const bundle=await bundleScript({entryPoints:['ui/companion/fox-preferences.ts'],globalName:'Preferences'});
await withBrowser(async browser=>{
 const page=await browser.newPage();
 await page.setContent('<section id="guide"></section>');
 await page.addScriptTag({content:bundle});
 await page.evaluate(async()=>{
  const fixture=window as any;
  fixture.calls=[];fixture.platform='windows';fixture.cancel=true;fixture.pending=false;
  const view={setGuide(value){const body=document.getElementById('guide')!;body.textContent=value?.text||'';body.append(...value?.actions||[]);}};
  const call=async(action,args:{operation?:string}={})=>{
   if(action==='foxPreferences')return {platform:fixture.platform,backupPending:fixture.pending,model:{name:'Fixture'}};
   fixture.calls.push({action,...args});
   if(args.operation==='choose')return {id:'reviewed-backup',createdAt:'2026-09-24',count:3};
   if(args.operation==='restore')fixture.pending=true;
   if(args.operation==='cancelRestore')fixture.pending=false;
   return fixture.cancel?{cancelled:true}:{ok:true};
  };
  fixture.preferences=fixture.Preferences.createFoxPreferences({call,view});
  await fixture.preferences.show('data');
 });
 assert.match(await page.locator('#guide').innerText(),/when you next open Worldlet/);
 assert.equal(await page.getByRole('button',{name:'Restore backup',exact:true}).count(),1);
 await page.getByRole('button',{name:'Export backup',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Export backup',exact:true}).count(),1);
 await page.evaluate(()=>{(window as any).cancel=false;});
 await page.getByRole('button',{name:'Export backup',exact:true}).click();
 await page.getByText('Backup saved on your device. Keep it private.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls),[{action:'dataBackup',operation:'export'},{action:'dataBackup',operation:'export'}]);
 await page.evaluate(async()=>{await (window as any).preferences.show('data');});
 await page.getByRole('button',{name:'Restore backup',exact:true}).click();
 await page.getByRole('button',{name:'Restore when I reopen',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.some(call=>call.operation==='restore')),false);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls.at(-1).operation),'cancel');
 await page.getByRole('button',{name:'Restore backup',exact:true}).click();
 await page.getByRole('button',{name:'Restore when I reopen',exact:true}).click();
 await page.getByRole('button',{name:'Cancel scheduled restore',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(call=>call.operation==='restore')),[{action:'dataBackup',operation:'restore',id:'reviewed-backup'}]);
 assert.match(await page.locator('#guide').innerText(),/Close and reopen Worldlet/);
 await page.getByRole('button',{name:'Cancel scheduled restore',exact:true}).click();
 await page.getByRole('button',{name:'Restore backup',exact:true}).waitFor();
 await page.evaluate(async()=>{const fixture=window as any;fixture.platform='macos';await fixture.preferences.show('data');});
 assert.equal(await page.getByRole('button',{name:'Restore backup',exact:true}).count(),1);
 console.log('PASS Windows backup guide: export, reviewed restore, cancellation before/after scheduling and unchanged Mac restore entry.');
});
