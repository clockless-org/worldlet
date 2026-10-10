// Theme-driven Artifacts (core/artifacts/README.md#theme-driven-artifacts): one way to make every card, filled in the
// host's template or laid out as a page by the Agent from the theme's look.
import assert from 'node:assert/strict';
import {ARTIFACT_PAGE_LIMITS,ARTIFACT_PAGE_REPORT,ARTIFACT_PAGE_ROOM,artifactPageActions,artifactPageBrief,artifactPageBudget,artifactPageDocument,artifactPageProblems,artifactPageTask,artifactPageTrialProblems,artifactPageZoom,artifactRenderMode,placeArtifactMaterials,readArtifactPage,readArtifactPageConsole,readArtifactPageSpec,type Artifact} from '../core/artifacts/index.ts';
import {themeArtifact} from '../ui/themes/build-theme.ts';

// Which mode: only an answer at medium or large size, in the World, with a theme look and a generator, is a page.
const host={theme:true,generator:true};
assert.equal(artifactRenderMode({kind:'answer',size:'large'},host),'page');
assert.equal(artifactRenderMode({kind:'answer',size:'medium'},host),'page');
assert.equal(artifactRenderMode({kind:'answer',size:'small'},host),'template','a small card is filled in the template');
assert.equal(artifactRenderMode({kind:'attention',size:'large'},host),'template','an Attention card is the template mode');
assert.equal(artifactRenderMode({kind:'answer',size:'large'},{...host,inApplet:true}),'template','over an Applet the corner card stays a template');
assert.equal(artifactRenderMode({kind:'answer',size:'large'},{...host,theme:false}),'template','a theme without a look keeps the host card');
assert.equal(artifactRenderMode({kind:'answer',size:'large'},{...host,generator:false}),'template','no background Agent, no page');

// The Village describes its Artifacts; the host reads its files as published URLs.
const look=themeArtifact();
assert.ok(look,'the Village declares an Artifact look');
assert.match(look.style,/^theme-assets\/village\/artifact\/STYLE\.md$/);
assert.match(look.prompt,/^theme-assets\/village\/artifact\/HOST-PROMPT\.md$/);
assert.ok(look.references.length>=1&&look.references.every(r=>r.url.startsWith('theme-assets/village/')));
assert.deepEqual(look.materials.map(m=>m.id),['paper','garden','soup']);
assert.equal(look.colors.moss,'#315f48');

// The spec the page passes is bounded; without rules there is none.
const spec=readArtifactPageSpec({theme:'village',style:'# Rules',prompt:'# Prompt',references:[{role:'Primary'}],materials:[{id:'garden',usage:'Glasshouse'},{id:'Bad Id',usage:'x'}],colors:{moss:'#315f48',ink:'green'}})!;
assert.deepEqual(spec.materials.map(m=>m.id),['garden']);assert.deepEqual(spec.colors,{moss:'#315f48'});
assert.equal(readArtifactPageSpec({theme:'village',style:'',prompt:'x'}),null);
assert.equal(readArtifactPageSpec({theme:'../x',style:'a',prompt:'b'}),null);

// The card's content goes to the generator as Fox wrote it, with the room, the theme's look and the host's rules.
const artifact:Artifact={id:'art-abcdefghijkl',kind:'answer',title:'Afternoon at the glasshouse',body:'Leave at **2 PM**.',brief:'A two-hour outing.',chart:null,size:'large',origin:{type:'conversation',place:'world'},
 actions:[{label:'Book tickets',request:'Book two tickets for the glasshouse at 2 PM'}],blocks:[{type:'choice',label:'Lunch',options:[{label:'Soup',request:'Plan soup for lunch'},{label:'Salad',request:'Plan salad for lunch'}]}],tone:'teal',createdAt:1,updatedAt:1};
assert.deepEqual(artifactPageActions(artifact).map(a=>a.label),['Book tickets','Soup','Salad'],'actions are the next steps, then the choices');
const task=artifactPageTask(artifact);
assert.ok(task.length<2000&&task.includes(artifact.id)&&task.includes('artifact/brief')&&task.includes('artifact/page'),'the task fits an Applet task and names its two steps');
const brief=artifactPageBrief(artifact,spec,'large');
assert.equal(brief.content.title,artifact.title);assert.equal(brief.content.body,artifact.body);
assert.deepEqual(brief.content.actions,[{index:0,label:'Book tickets'},{index:1,label:'Soup'},{index:2,label:'Salad'}],'the page sees labels and numbers, never the requests');
assert.deepEqual(brief.room,{...ARTIFACT_PAGE_ROOM.large,size:'large'});
assert.equal(brief.theme.rules,'# Rules');
assert.ok(brief.host.some(line=>/never scrolls/.test(line))&&brief.host.some(line=>/worldlet\.act/.test(line))&&brief.host.some(line=>/worldlet-material:/.test(line)));

// Static rules: offline, small, and only the theme's materials.
const page='<!doctype html><html><head><style>body{margin:0}</style></head><body><img src="worldlet-material:garden" alt=""><h1>Afternoon</h1><button onclick="worldlet.act(0)">Book tickets</button></body></html>';
assert.deepEqual(artifactPageProblems(page,['garden']),[],'a page with inline style and no script is fine');
assert.match(artifactPageProblems(page,['soup']).join(' '),/materials the theme does not have \(garden\)/);
assert.match(artifactPageProblems('<html><body><script>fetch("/x")</script></body></html>',[]).join(' '),/fetch/);
assert.match(artifactPageProblems('<html><body><img src="https://example.com/a.png"></body></html>',[]).join(' '),/addresses/);
assert.match(artifactPageProblems('x'.repeat(ARTIFACT_PAGE_LIMITS.bytes+1),[]).join(' '),/KB/);
// Materials are placed as data addresses; anything else is left as it was.
const png='data:image/png;base64,iVBORw0KGgo=';
assert.ok(placeArtifactMaterials(page,{garden:png}).includes(`src="${png}"`));
assert.ok(placeArtifactMaterials(page,{garden:'javascript:alert(1)'}).includes('worldlet-material:garden'));

// The document: policy, storage, act and fit ahead of the page's own code.
const document=artifactPageDocument(page,{seed:{state:{ticked:'1'}},actions:3});
assert.ok(document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"'),'the policy comes first');
assert.ok(document.indexOf('worldlet-material:garden')>document.indexOf('localStorage'),'the prelude runs before the page');
assert.ok(document.includes('"ticked":"1"')&&document.includes('index<3')&&document.includes('userActivation'),'seeded, bounded and only on a click');
assert.ok(!artifactPageDocument(page,{seed:{state:{x:'</script><script>alert(1)'}}}).includes('</script><script>alert(1)'),'a stored value cannot close the prelude');

// Reports from the page.
assert.deepEqual(readArtifactPageConsole(ARTIFACT_PAGE_REPORT+'{"action":1}'),{action:1});
assert.equal(readArtifactPageConsole(ARTIFACT_PAGE_REPORT+'{"action":99}'),null);
assert.deepEqual(readArtifactPageConsole(ARTIFACT_PAGE_REPORT+'{"state":{"a":"1","b":2}}'),{state:{a:'1'}});
assert.deepEqual(readArtifactPageConsole(ARTIFACT_PAGE_REPORT+'{"fit":{"width":940,"height":680,"scrollWidth":940,"scrollHeight":900}}'),{fit:{width:940,height:680,scrollWidth:940,scrollHeight:900}});
assert.equal(readArtifactPageConsole('hello'),null);

// The trial: a page that scrolls is sent back; at show time one is scaled down, never scrolled.
assert.deepEqual(artifactPageTrialProblems({errors:[],distinctColors:40,loaded:true,fit:{width:940,height:680,scrollWidth:940,scrollHeight:690}}),[]);
assert.match(artifactPageTrialProblems({errors:[],distinctColors:40,loaded:true,fit:{width:940,height:680,scrollWidth:940,scrollHeight:1200}}).join(' '),/fit without scrolling/);
assert.match(artifactPageTrialProblems({errors:[],distinctColors:40,loaded:true,fit:{width:720,height:420,scrollWidth:900,scrollHeight:420}}).join(' '),/sideways/);
assert.match(artifactPageTrialProblems({errors:['x is not defined'],distinctColors:40,loaded:true}).join(' '),/Script error/);
assert.equal(artifactPageZoom({width:940,height:680,scrollWidth:940,scrollHeight:680}),1);
assert.equal(artifactPageZoom({width:940,height:680,scrollWidth:940,scrollHeight:850}),.8);
assert.equal(artifactPageZoom({width:940,height:680,scrollWidth:940,scrollHeight:5000}),.5,'never smaller than half');

// A kept page, and the day's budget.
const kept=readArtifactPage({id:artifact.id,html:'<p>x</p>',size:'large',theme:'village',state:{a:'1',b:2},createdAt:5});
assert.deepEqual(kept,{id:artifact.id,html:'<p>x</p>',size:'large',theme:'village',state:{a:'1'},createdAt:5,updatedAt:5});
assert.equal(readArtifactPage({id:artifact.id,html:''}),null);
let budget=null as {day:string;count:number}|null;
for(let i=0;i<ARTIFACT_PAGE_LIMITS.perDay;i++){const next=artifactPageBudget(budget,'2026-10-10');assert.ok(next.allowed);budget=next.next;}
assert.equal(artifactPageBudget(budget,'2026-10-10').allowed,false);
assert.equal(artifactPageBudget(budget,'2026-10-11').allowed,true,'a new day starts again');

console.log('PASS Artifact pages: template or page by kind, size and place, the Village look, bounded spec, brief, task, static rules, materials, prelude, reports, fit and zoom, kept page, daily budget');
