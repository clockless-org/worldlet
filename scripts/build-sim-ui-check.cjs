const {app,BrowserWindow}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('.local/sim-evidence');app.setPath('userData',path.join(out,'profile'));
app.whenReady().then(async()=>{await fs.mkdir(out,{recursive:true});app.dock?.hide();const win=new BrowserWindow({width:1500,height:844,useContentSize:true,show:false,focusable:false,webPreferences:{offscreen:true,sandbox:true,nodeIntegration:false,contextIsolation:true}});const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});const run=(fn,arg)=>win.webContents.executeJavaScript('('+fn.toString()+')('+JSON.stringify(arg)+')');
 try{await win.loadFile(path.resolve('dist/WorldletWeb/theme-preview.html'));assert.match(win.getTitle(),/host preview/);await run(()=>simFixture.open());await run(async()=>{await new Promise(r=>requestAnimationFrame(r));await document.fonts.ready;await Promise.all([...simFixture.host.querySelectorAll('img')].filter(i=>i.getAttribute('src')).map(i=>i.decode()));});
 await run(()=>new Promise(r=>setTimeout(r,200)));
 const theme=await run(()=>document.documentElement.dataset.buildTheme);await fs.writeFile(path.join(out,theme+'-world.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(await run(()=>{const b=simFixture.host.querySelector('button'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
 await run(()=>[...simFixture.host.querySelectorAll('button')].find(b=>b.textContent==='mail'||b.getAttribute('aria-label')==='mail').click());
 assert.equal(await run(()=>simFixture.scene.metrics.active),'app-gmail');assert.equal(await run(()=>!!simFixture.host.querySelector('[data-theme-rendered=true]')),true);
 await run(()=>[...simFixture.host.querySelectorAll('button')].find(b=>b.textContent==='Open original'||b.textContent==='Contract record').click());assert.match(await run(()=>JSON.stringify(simFixture.events)),/applet-item/);
 await run(()=>simFixture.home());assert.equal(await run(()=>simFixture.scene.metrics.active),'overview');
 await run(()=>[...simFixture.host.querySelectorAll('button')].find(b=>b.textContent==='Future applet'||b.getAttribute('aria-label')==='Future applet').click());
 assert.equal(await run(()=>simFixture.host.textContent.includes('Contract record')),true);
 // Content rectangle remains registered to its painting after a non-reference viewport resize.
 await win.setContentSize(1280,900);await run(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(await run(()=>{const slot=simFixture.host.querySelector('.ui-theme-applet [data-sim-slot=content]'),frame=slot.closest('.sim-canvas'),r=slot.getBoundingClientRect(),f=frame.getBoundingClientRect();return r.width>0&&r.left>=f.left&&r.top>=f.top&&r.right<=f.right+.1&&r.bottom<=f.bottom+.1;}),true);
 await win.setContentSize(1500,844);await run(()=>new Promise(r=>requestAnimationFrame(r)));await fs.writeFile(path.join(out,theme+'-fallback.png'),(await win.webContents.capturePage()).toPNG());
 await run(()=>{simFixture.scene.setAppStage('app-future',{items:[],reading:true});});assert.equal(await run(()=>simFixture.host.textContent.includes('Reading')),true);
 await run(()=>{simFixture.scene.setAppStage('app-future',{items:[],error:'Fixture unavailable'});});assert.equal(await run(()=>simFixture.host.textContent.includes('Fixture unavailable')),true);
 await run(()=>simFixture.destroy());assert.equal(await run(()=>!!document.querySelector('#sim-world-fixture')),false);assert.deepEqual(errors,[]);console.log('PASS Sim '+theme+': World → Applet → original → World, unknown applet, resize registration, loading/error, disposal');app.exit(0);
 }catch(e){console.error(String(e),e.stack);await fs.writeFile(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());app.exit(1);}
});
