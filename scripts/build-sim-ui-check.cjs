const {app,BrowserWindow}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('.local/sim-evidence');app.setPath('userData',path.join(out,'profile'));
app.whenReady().then(async()=>{await fs.mkdir(out,{recursive:true});app.dock?.hide();const win=new BrowserWindow({width:1500,height:844,useContentSize:true,show:false,focusable:false,webPreferences:{offscreen:true,sandbox:true,nodeIntegration:false,contextIsolation:true}});const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);if(process.env.SIM_DEBUG)console.log('[renderer]',event.message);});const run=(fn,arg)=>win.webContents.executeJavaScript('('+fn.toString()+')('+JSON.stringify(arg)+')');
 // Offscreen capture right after a resize can fail before the compositor has a new frame.
 const capture=async()=>{for(let i=0;;i++){try{return await win.webContents.capturePage();}catch(error){if(i>=4)throw error;await new Promise(r=>setTimeout(r,250));}}};
 try{await win.loadFile(path.resolve('dist/WorldletWeb/theme-preview.html'));assert.match(win.getTitle(),/host preview/);
 const themes=await run(()=>simFixture.themes);assert(themes.length>=2,'at least two bundled themes prove replacement');
 for(const id of themes){await win.setContentSize(1500,844);await run(id=>simFixture.use(id),id);assert.equal(await run(()=>document.querySelectorAll('link[data-theme-style]').length),1,'only the active theme stylesheet is attached');await run(()=>simFixture.open());await run(async()=>{await new Promise(r=>requestAnimationFrame(r));await document.fonts.ready;await Promise.all([...simFixture.host.querySelectorAll('img')].filter(i=>i.getAttribute('src')).map(i=>i.decode()));});
 await run(()=>new Promise(r=>setTimeout(r,200)));
 const theme=await run(()=>document.documentElement.dataset.buildTheme);assert.equal(theme,id);assert.equal(await run(()=>simFixture.scene.metrics.theme),id);await fs.writeFile(path.join(out,theme+'-world.png'),(await capture()).toPNG());
 assert.equal(await run(()=>{const b=simFixture.host.querySelector('button'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
 await run(()=>[...simFixture.host.querySelectorAll('button')].find(b=>b.textContent==='mail'||b.getAttribute('aria-label')==='mail').click());
 assert.equal(await run(()=>simFixture.scene.metrics.active),'app-gmail');assert.equal(await run(()=>!!simFixture.host.querySelector('[data-theme-rendered=true]')),true);
 // Open the record's original. A theme may first show the record in its reader (Blueprint), then offer Open original.
 await run(async()=>{simFixture.events.length=0;const find=t=>[...simFixture.host.querySelectorAll('button')].find(b=>b.textContent===t);if(!find('Open original'))find('Contract record')?.click();await new Promise(r=>requestAnimationFrame(r));(find('Open original')||find('Contract record')).click();});assert.match(await run(()=>JSON.stringify(simFixture.events)),/applet-item/);
 await run(()=>simFixture.home());assert.equal(await run(()=>simFixture.scene.metrics.active),'overview');
 await run(()=>[...simFixture.host.querySelectorAll('button')].find(b=>b.textContent==='Future applet'||b.getAttribute('aria-label')==='Future applet').click());
 assert.equal(await run(()=>simFixture.host.textContent.includes('Contract record')),true);
 // Content rectangle remains registered to its painting after a non-reference viewport resize.
 await win.setContentSize(1280,900);await run(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(await run(()=>{const slot=simFixture.host.querySelector('.ui-theme-applet [data-sim-slot=content]'),frame=slot.parentElement,r=slot.getBoundingClientRect(),f=frame.getBoundingClientRect();return r.width>0&&r.left>=f.left&&r.top>=f.top&&r.right<=f.right+.1&&r.bottom<=f.bottom+.1;}),true);
 await win.setContentSize(1500,844);await run(()=>new Promise(r=>requestAnimationFrame(r)));await fs.writeFile(path.join(out,theme+'-fallback.png'),(await capture()).toPNG());
 await run(()=>{simFixture.scene.setAppStage('app-future',{items:[],reading:true});});assert.equal(await run(()=>simFixture.host.textContent.includes('Reading')),true);
 await run(()=>{simFixture.scene.setAppStage('app-future',{items:[],error:'Fixture unavailable'});});assert.equal(await run(()=>simFixture.host.textContent.includes('Fixture unavailable')),true);
 await run(()=>simFixture.destroy());assert.equal(await run(()=>!!document.querySelector('#sim-world-fixture')),false);console.log('PASS Sim '+theme+': World → Applet → original → World, unknown applet, resize registration, loading/error, disposal');}
assert.deepEqual(errors,[]);console.log('PASS one-step theme switch across '+themes.join(', '));app.exit(0);
 }catch(e){console.error(String(e),e.stack);await fs.writeFile(path.join(out,'failure.png'),(await capture()).toPNG());app.exit(1);}
});
