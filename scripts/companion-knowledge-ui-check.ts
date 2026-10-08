// The Profile page shows what the World holds about the companion: saved memory by kind, Fox's own
// conversation and what each other Agent brought, grouped and collapsible, every skill with when it last ran, and Fox's
// offer to save a task it repeats (companion-skills.ts). Fixture data only.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl,openCompanionPanel} from './browser-test.ts';

await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  (window as any).events=[];(window as any).skillCalls=[];
  const day=86_400_000,offer={id:'repeat-abc',name:'draft-replies-mail',description:'Use when asked: draft replies for the new mail.',body:'1. Read',times:3,lastAt:Date.now(),asks:['Draft replies to my mail','draft replies for the new mail']};
  const skills=(saved:boolean)=>({skills:[{name:'seed-swap',description:'Organize seed swaps.',where:'agent',lastRanAt:Date.now()-3*day},{name:'publish',description:'Publish.',where:'world',lastRanAt:null},...saved?[{name:'draft-replies-mail',description:'',where:'both',lastRanAt:null}]:[]],proposals:saved?[]:[offer],saves:'agent',agent:'Nova'});addEventListener('worldlet:memory-manager',()=>(window as any).events.push('memory-manager'));
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return {workspaceId:'knowledge-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='companionProfile')return {name:'Nova',createdAt:'2026-09-01T12:00:00Z',personality:'Curious and thoughtful.',knowledge:{
    memories:[{kind:'user',text:'Prefers Chinese.\n§\nRuns on Saturday mornings.',source:'Hermes memories/USER.md'},{kind:'longTerm',text:'Worldlet ships three times a day.\n\nThe lease renewal is due in November.',source:'OpenClaw on this computer'}],
    conversations:42,
    brought:[{source:'openclaw',title:'OpenClaw',conversations:120,notes:3,skills:['daily-brief','travel'],routines:[{name:'Morning brief',schedule:'0 8 * * *'}]},{source:'codex',title:'Codex',conversations:0,notes:0,skills:[],routines:[]}]}};
   if(b.action==='foxSkills'){(window as any).skillCalls.push(b.operation??'list');return b.operation==='save'?{...skills(true),where:'agent',note:'Saved in Nova’s skills and kept in the World.'}:skills(false);}
   if(b.action==='modelStatus')return {available:true,provider:'hermes'};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.locator('#worldStartup').waitFor({state:'detached'});
 await openCompanionPanel(page);
 const panel=page.locator('#companionInfo'),block=panel.locator('.companion-profile-knowledge');
 await block.getByRole('heading',{name:'What Nova knows'}).waitFor();
 const groups=block.locator('details.companion-knowledge-group');
 assert.deepEqual(await groups.locator('summary .companion-knowledge-title').allTextContents(),['About you','Memory','From OpenClaw','Skills'],'memory kinds, each Agent that brought something, then every skill');
 assert.deepEqual(await groups.locator('summary .companion-knowledge-count').allTextContents(),['2 entries','2 entries','120 messages · 3 notes · 2 skills · 1 routine','2 skills']);
 assert.equal(await groups.first().getAttribute('open'),'','About you starts open');
 assert.deepEqual(await groups.first().locator('li').allTextContents(),['Prefers Chinese.','Runs on Saturday mornings.']);
 await block.getByText('Nova’s own conversation: 42 messages',{exact:true}).waitFor();
 await groups.nth(2).locator('summary').click();
 await groups.nth(2).getByText('Morning brief · 0 8 * * *',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/worldlet-companion-knowledge.png'});
 // A re-render (audio, layout) keeps which groups are open.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:audio',{detail:{}})));
 assert.equal(await block.locator('details[data-group="from:openclaw"]').getAttribute('open'),'');
 // Every skill with when it last ran and where it lives; then Fox's offer, saved on the person's word.
 await groups.nth(3).locator('summary').click();
 assert.deepEqual(await groups.nth(3).locator('.companion-skill-meta').allTextContents(),['Ran 3 days ago · In your Agent','Not run yet · Kept in the World']);
 const offer=block.locator('.companion-skill-offer');
 await offer.getByRole('heading',{name:'Nova did this 3 times'}).waitFor();
 await offer.getByText(/It goes into Nova’s skills, and the World keeps a copy\./).waitFor();
 await offer.getByRole('button',{name:'Save as a skill'}).click();
 await block.getByText('Saved in Nova’s skills and kept in the World.',{exact:true}).waitFor();
 assert.equal(await block.locator('.companion-skill-offer').count(),0,'a saved offer leaves');
 assert.deepEqual(await page.evaluate(()=>(window as any).skillCalls.filter((c:string)=>c!=='list')),['save']);
 await block.getByRole('button',{name:'Edit memory'}).click();
 assert.deepEqual(await page.evaluate(()=>(window as any).events),['memory-manager']);
 console.log('PASS companion profile: saved memory by kind, own conversation and what other Agents brought, grouped and collapsible; skills with when each last ran and Fox’s offer to save a repeated task');
});
