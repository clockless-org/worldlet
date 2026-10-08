import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
// Run the production bundle with a fake browser and mocked ingestion: no real telemetry.
const code=(await readFile('dist/web/analytics.js','utf8')).replace(/export\s*\{[^}]*\};?\s*$/,'');
function run(host='worldlet.ai',off=false,dnt=false,{referrer='https://private.example/sensitive',query='?utm_source=producthunt&utm_medium=community&utm_campaign=launch&secret=private',queued=[] as unknown[],team=''}={}){
 const sent:any[]=[],urls:string[]=[];const storage=new Map<string,string>();if(off)storage.set('worldlet.marketing.analytics','off');
 const store={getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)};
 const listeners:Record<string,Function>={};
 if(team)storage.set('worldlet.marketing.team',team);
 const window:any={__worldletEvents:[...queued]};
 const sandbox={window,location:{hostname:host,pathname:'/',href:`https://${host}/${query}`},navigator:{doNotTrack:dnt?'1':'0'},document:{referrer,querySelector:()=>null,addEventListener:(k:string,f:Function)=>listeners[k]=f},localStorage:store,sessionStorage:store,crypto:{randomUUID:()=>crypto.randomUUID()},URL,Element:class {},fetch:async (url:string,o:any)=>{urls.push(url);sent.push(JSON.parse(o.body));return {};}};
 Object.assign(window,sandbox);vm.runInNewContext(code,window);return {sent,urls,storage,listeners,sandbox:window};
}
const a=run();assert.equal(a.sent.length,1);assert.equal(a.sent[0].event,'$pageview');assert.equal(a.sent[0].properties.utm_source,'producthunt');assert.equal(a.sent[0].properties.$current_url,'https://worldlet.ai/');assert(!JSON.stringify(a.sent).includes('private'));assert(!JSON.stringify(a.sent).includes('secret'));assert.equal(run('localhost').sent.length,0);assert.equal(run('worldlet.ai',true).sent.length,0);assert.equal(run('worldlet.ai',false,true).sent.length,0);
const anchor={id:'download-windows',hasAttribute:()=>false,href:'https://worldlet.ai/downloads/setup.exe'};
const target=new a.sandbox.Element() as any;target.closest=()=>anchor;a.listeners.click({target});assert.equal(a.sent[1].event,'download_clicked');assert.equal(a.sent[1].properties.platform,'windows');assert.equal(a.sent[0].properties.distinct_id,a.sent[1].properties.distinct_id);
a.storage.set('worldlet.marketing.analytics','off');a.listeners.click({target});assert.equal(a.sent.length,2);
// A referrer becomes only a known site's name, never its address: X's t.co links count as x, unknown sites as referral.
for(const [ref,source] of [['https://t.co/AbCd1234','x'],['https://www.reddit.com/r/LocalLLaMA/comments/x','reddit'],['https://news.ycombinator.com/item?id=1','hackernews'],['https://www.google.com/','google'],['https://worldlet.ai/download/','direct'],['https://private.example/sensitive','referral']]){
 const r=run('worldlet.ai',false,false,{referrer:ref,query:''});assert.equal(r.sent[0].properties.utm_source,source,ref);assert(!JSON.stringify(r.sent).includes('AbCd1234')&&!JSON.stringify(r.sent).includes('LocalLLaMA'));
}
// Get Worldlet buttons and queued funnel events: queued before or pushed after the script, only allowlisted events and values.
const get={hasAttribute:(k:string)=>k==='data-get-worldlet',id:'',href:'https://worldlet.ai/download/',closest:(q:string)=>q==='header'?{}:null};
const g=run('worldlet.ai',false,false,{queued:[['get_worldlet_clicked',{placement:'hero',email:'x@example.invalid'}],['made_up',{}],['waitlist_submitted',{agent:'codex'}]]});
assert.deepEqual(g.sent.map(e=>e.event),['$pageview','get_worldlet_clicked'],'retired waitlist events are dropped');assert.deepEqual(Object.keys(g.sent[1].properties).filter(k=>['placement','email'].includes(k)),['placement']);assert.equal(g.sent[1].properties.placement,'hero');
const gt=new g.sandbox.Element() as any;gt.closest=()=>get;g.listeners.click({target:gt});assert.equal(g.sent[2].event,'get_worldlet_clicked');assert.equal(g.sent[2].properties.placement,'header');
g.sandbox.__worldletEvents.push(['get_worldlet_clicked',{placement:'footer'}],['get_worldlet_clicked',{placement:'<script>'}],['invite_redeemed',{via:'link'}]);assert.deepEqual(g.sent.slice(3).map(e=>[e.event,e.properties.placement]),[['get_worldlet_clicked','footer'],['get_worldlet_clicked',undefined]]);
assert(!JSON.stringify(g.sent).includes('example.invalid'),'no form content is sent');
// ?team=1 marks our own browser; its events say audience team so admin leaves them out.
const t=run('worldlet.ai',false,false,{query:'?team=1'});assert.equal(t.sent[0].properties.audience,'team');assert.equal(t.storage.get('worldlet.marketing.team'),'1');
assert.equal(run('worldlet.ai',false,false,{team:'1',query:'?team=0'}).sent[0].properties.audience,undefined);assert.equal(a.sent[0].properties.audience,undefined);
// Every built page that loads analytics must let its CSP reach the capture origin.
const captureOrigin=new URL(a.urls[0]).origin;let instrumented=0;
for(const page of (await readdir('dist/web',{recursive:true})).filter(file=>file.endsWith('.html'))){
 const html=await readFile('dist/web/'+page,'utf8');if(!html.includes('src="/analytics.js"'))continue;instrumented++;
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];if(!policy)continue;
 const directives=Object.fromEntries(policy.split(';').map(d=>d.trim().split(/\s+/)).filter(([name])=>name).map(([name,...sources])=>[name,sources]));
 const allowed=directives['connect-src']??directives['default-src'];
 assert(!allowed||allowed.includes(captureOrigin),`${page} loads analytics but its CSP connect-src blocks ${captureOrigin}`);
}
assert(instrumented>0,'No built page loads analytics.');
console.log('Analytics checks passed: attribution, referrer sites, funnel events, team browsers, no private URLs, production guard, opt-out/DNT, download event, stable ID, CSP allows capture on every instrumented page.');
