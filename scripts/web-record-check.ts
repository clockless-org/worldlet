// What the built-in browser records (core/browser/web-record.ts): a real Chromium page on a local
// site with a JSON API, a form and a WebSocket, recorded through DevTools by the host recorder into a
// World database, then searched and read back as Fox would. Secrets never reach the database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {WebSocketServer} from 'ws';
import {launchTestBrowser} from './browser-test.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {WebRecorder,manageRecordings} from '../platform/electron/src/modules/browser/recorder.ts';
import {installWebRecorder} from '../platform/bridge/web-record.js';
import {typedAddress,cleanHeaders,cleanMessage,cleanRequestBody,cleanResponseBody,cleanWebAddress,privateWebAddress,scrubSent,secretField,SECRET_NAME,WEB_RECORD,webSearchPlan,webSite,webTranscript,RAW_KINDS,type WebRecord} from '../core/browser/index.ts';
import {placeContext,recentBrowsing} from '../core/companion/index.ts';

// Rules ------------------------------------------------------------------------------------------
assert.equal(webSite('https://www.Example.com/a'),'example.com');
assert.equal(webSite('about:blank'),'');
for(const url of ['https://accounts.google.com/signin','https://www.paypal.com/checkout','https://shop.example.com/checkout/pay','https://example.com/login','https://mybank.com/',
 // Sign-in words inside a segment, and sign-in hosts.
 'https://blog.example.com/wp-login.php','https://example.com/users/sign_in','https://example.com/reset-password','https://example.com/api/payment_methods',
 'https://login.example.com/','https://auth.example.com/x','https://sso.example.com/','https://signin.example.com/','https://id.example.com/','https://idp.example.com/'])
 assert.ok(privateWebAddress(url),url+' is never recorded');
for(const url of ['https://play.pokemonshowdown.com/battle-gen9randombattle-1','https://www.youtube.com/watch?v=1','https://example.com/author/jo'])
 assert.ok(!privateWebAddress(url),url+' is recorded');
assert.equal(cleanWebAddress('https://u:p@example.com/a?token=abc&q=1'),'https://example.com/a?token=%5Bhidden%5D&q=1');
// Sign-in and signed-link query values are hidden in every stored address.
for(const key of ['code','key','jwt','state','nonce','ticket','sig'])assert.equal(cleanWebAddress(`https://example.com/cb?${key}=s3cr3t&q=1`),`https://example.com/cb?${key}=%5Bhidden%5D&q=1`,key);
assert.deepEqual(cleanHeaders({Cookie:'a=1','Set-Cookie':'b=2',Authorization:'Bearer x','Content-Type':'application/json','X-Session-Token':'t'}),{'content-type':'application/json'});
// Session, key and signature headers go; referer and origin lose secret query values.
assert.deepEqual(cleanHeaders({'X-Session-Id':'s','X-Access-Key':'k','X-Signature':'g','Referer':'https://example.com/cb?code=s3cr3t&q=1','Origin':'https://example.com'}),{referer:'https://example.com/cb?code=%5Bhidden%5D&q=1',origin:'https://example.com/'});
assert.equal(cleanRequestBody('{"query":"pikachu","password":"hunter2","card_number":"4242","author":"jo"}','application/json'),'{"query":"pikachu","password":"[hidden]","card_number":"[hidden]","author":"jo"}');
// Form bodies: each value is scrubbed by itself, spaces keep their encoding and the marker stays readable.
assert.equal(cleanRequestBody('q=pikachu&pass=hunter2','application/x-www-form-urlencoded'),'q=pikachu&pass=[hidden]');
assert.equal(cleanRequestBody('log=admin&pwd=hunter2&rememberme=forever','application/x-www-form-urlencoded'),'log=admin&pwd=[hidden]&rememberme=forever','WordPress sign-in');
assert.equal(cleanRequestBody('q=two+words&note='+'a1b2'.repeat(20),'application/x-www-form-urlencoded'),'q=two+words&note=[hidden]');
assert.equal(scrubSent('|/trn ash,0,'+'a1b2'.repeat(30)),'|/trn ash,0,[hidden]');
// Values under payment parents, secret name/value pairs, card numbers, codes, GraphQL sign-ins and multipart secrets.
assert.equal(cleanRequestBody('{"card":{"number":"4242424242424242","exp":"12/30"},"item":"ball"}','application/json'),'{"card":"[hidden]","item":"ball"}');
assert.equal(cleanRequestBody('{"fields":[{"name":"password","value":"hunter2"},{"name":"user","value":"ash"}]}','application/json'),'{"fields":[{"name":"password","value":"[hidden]"},{"name":"user","value":"ash"}]}');
assert.equal(cleanRequestBody('{"note":"pay 4242 4242 4242 4242 now","order":"12345"}','application/json'),'{"note":"pay [hidden] now","order":"12345"}');
for(const key of ['code','otp','totp','mfa_token','2fa','verification','security_code','smsCode','cvn','pwd','jwt','bearer','refresh','nonce','csrf','xsrf'])
 assert.equal(cleanRequestBody(`{"${key}":"123456"}`,'application/json'),`{"${key}":"[hidden]"}`,key);
assert.equal(cleanRequestBody('{"query":"mutation Login($p:String!){login(password:$p){ok}}","variables":{"p":"hunter2"}}','application/json'),'','a GraphQL sign-in is not kept');
assert.equal(cleanRequestBody('--b\r\nContent-Disposition: form-data; name="pin"\r\n\r\n1234\r\n--b--','multipart/form-data; boundary=b'),'','a multipart secret field');
// Messages: JSON frames have secret keys hidden both ways, also behind a Socket.IO number.
assert.equal(cleanMessage('{"type":"auth","token":"t0k","move":"Earthquake"}',false),'{"type":"auth","token":"[hidden]","move":"Earthquake"}');
assert.equal(cleanMessage('42["login",{"password":"hunter2"}]',true),'42["login",{"password":"[hidden]"}]');
const jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
assert.equal(cleanMessage('data: '+jwt,false),'data: [hidden]');
// Received bodies: redacted before they are cut; forms, JWTs, hidden inputs and CSRF meta values.
assert.ok(!cleanResponseBody(JSON.stringify({token:'big-secret',pad:'x'.repeat(WEB_RECORD.bodyLimit)}),'application/json').includes('big-secret'),'a large JSON body is redacted before it is cut');
assert.equal(cleanResponseBody('access_token=gho_abc&scope=repo&token_type=bearer','application/x-www-form-urlencoded'),'access_token=[hidden]&scope=repo&token_type=[hidden]');
assert.equal(cleanResponseBody('{"user":"ash","jwt":"j","refresh":"r","csrf":"c","note":"'+jwt+'"}','application/json'),'{"user":"ash","jwt":"[hidden]","refresh":"[hidden]","csrf":"[hidden]","note":"[hidden]"}');
assert.equal(cleanResponseBody('<form><input type="hidden" name="authenticity_token" value="abc123"><input name="q" value="pika"></form><meta name="csrf-token" content="m3t4">','text/html'),
 '<form><input type="hidden" name="authenticity_token" value="[hidden]"><input name="q" value="pika"></form><meta name="csrf-token" content="[hidden]">');
assert.ok(!cleanResponseBody('{"a":1}\n{"session_token":"nd-secret"}\n','application/x-ndjson').includes('nd-secret'),'NDJSON secret keys');
// One field rule, in core and in the page observer: each hint is checked by itself.
for(const hint of ['pin','code','security_code','sms_code','pwd','Enter your PIN','one-time-code','cc-number'])assert.ok(secretField('text',hint),hint+' is a secret field');
for(const hint of ['trainer','q','Search','author'])assert.ok(!secretField('text',hint),hint+' is an ordinary field');
assert.ok(installWebRecorder.toString().includes(SECRET_NAME.toString()),'the observer carries core SECRET_NAME');
// Recordings expire without a page being opened: on start and every hour.
const deviceSource=fs.readFileSync(new URL('../platform/electron/src/modules/browser/device.ts',import.meta.url),'utf8');
assert.match(deviceSource,/setTimeout\(\(\)=>this\.pruneRecordings\(true\)/,'recordings are pruned on start');
assert.match(deviceSource,/setInterval\(\(\)=>this\.pruneRecordings\(true\),3_600_000\)/,'recordings are pruned hourly');
// The recorder: a page reported private keeps nothing until it navigates; socket addresses are checked;
// field names are checked again on the host.
{
 let address='https://example.com/a';const kept:WebRecord[]=[];
 const recorder=new WebRecorder({get url(){return address;},title:'',cdp:async()=>({})},(_,rows)=>kept.push(...rows),{applet:'browser'});
 recorder.observed({kind:'text',url:address,text:'before'});
 recorder.observed({kind:'private',url:address+'#signin'});
 recorder.observed({kind:'text',url:address,text:'MODAL-TEXT'});
 recorder.observed({kind:'input',url:address,field:'user',value:'ash'});
 recorder.event('Network.requestWillBeSent',{requestId:'1',type:'Fetch',request:{url:'https://example.com/api',method:'POST',postData:'user=ash'}});
 address='https://example.com/b';
 recorder.observed({kind:'page',url:address});
 recorder.observed({kind:'text',url:address,text:'after'});
 recorder.observed({kind:'input',url:address,field:'sms_code',value:'777111'});
 recorder.observed({kind:'input',url:address,field:'note',value:'card 4242424242424242'});
 recorder.observed({kind:'submit',url:address,fields:['Trainer: Ash','PIN: 1234']});
 recorder.event('Network.webSocketCreated',{requestId:'w',url:'wss://login.example.com/socket'});
 recorder.event('Network.webSocketFrameReceived',{requestId:'w',response:{opcode:1,payloadData:'hello'}});
 recorder.flush();
 assert.deepEqual(kept.map(r=>r.kind+':'+r.body),['text:before','page:','text:after','input:card [hidden]','submit:Trainer: Ash'],'private page, host field check and private socket');
}
assert.deepEqual(webSearchPlan({query:'  showdown  对战 ',site:'www.pokemonshowdown.com',after:'2026-10-01',offset:2},2_000_000_000).terms,['showdown','对战']);
assert.equal(webSearchPlan({site:'https://www.pokemonshowdown.com/x'},0).site,'pokemonshowdown.com');
const visit={id:'v',site:'example.com',url:'https://example.com/',title:'Example',applet:'browser',startedAt:0,endedAt:60};
const records:WebRecord[]=Array.from({length:50},(_,i)=>({at:i,kind:'ws-in',url:'wss://example.com/ws',meta:{},body:'|turn|'+i+' '+'x'.repeat(900)}));
const first=webTranscript(visit,records,{limit:10_000});
assert.ok(first.nextOffset!==null&&first.nextOffset>0&&first.text.length<=10_500,'a long recording reads page by page');
assert.match(webTranscript(visit,records.slice(first.nextOffset!),{offset:first.nextOffset!,limit:10_000}).text,new RegExp('\\|turn\\|'+first.nextOffset+' '),'the next page continues where the first stopped');

// An address typed to Fox in a website opens there; everything else is a message.
for(const [typed,url] of [['play.pokemonshowdown.com','https://play.pokemonshowdown.com/'],['https://example.com/a?b=1','https://example.com/a?b=1'],['http://news.ycombinator.com','https://news.ycombinator.com/'],['localhost.psim.us:8000/x','https://localhost.psim.us:8000/x']] as const)
 assert.equal(typedAddress(typed),url,typed);
for(const typed of ['look at my last two games','3.5','e.g.','javascript:alert(1)','file:///etc/passwd','https://u:p@example.com','hello.'])assert.equal(typedAddress(typed),null,typed);

// Long lines shorten in a first read, each record says its number, and the outline lists the pages.
const long:WebRecord={at:0,kind:'ws-in',url:'wss://example.com/ws',meta:{},body:'|request|'+JSON.stringify({side:'x'.repeat(2000)})};
const shortened=webTranscript(visit,[long],{full:false,offset:7,pages:[{index:0,url:'https://example.com/',at:0},{index:7,url:'https://example.com/battle-1',title:'Battle 1',at:0}]}).text;
assert.match(shortened,/#7\]/,'records carry their number');
assert.match(shortened,/… \[\+\d+ characters\]/,'a long line is shortened');
assert.ok(shortened.length<1200,'the shortened read is small');
assert.match(shortened,/#7 \S+ https:\/\/example\.com\/battle-1 — Battle 1/,'the outline names each page and its number');
assert.ok(webTranscript(visit,[long],{full:true}).text.includes('x'.repeat(2000)),'full reads the whole record');

// Places -----------------------------------------------------------------------------------------
const here=placeContext({thread:JSON.stringify(['web:pokemonshowdown.com','']),turns:[{role:'user',text:'go'},{role:'assistant',text:'ok'}],previous:JSON.stringify(['attention:honda',''])});
assert.equal(here?.place,'web:pokemonshowdown.com');
assert.equal(here?.earlierHere.length,2);
assert.equal(here?.cameFrom,'attention:honda','a turn after moving says where the person came from');
assert.equal(placeContext({thread:'["web:a",""]',turns:[],previous:'["web:a",""]'})?.cameFrom,undefined);
assert.deepEqual(recentBrowsing([{site:'a.com',title:'A',startedAt:0,endedAt:600}],1200),[{site:'a.com',title:'A',minutesAgo:10,minutes:10}]);
// The visit on screen is marked as such, never as a finished one minutes ago.
assert.deepEqual(recentBrowsing([{id:'v2',site:'b.com',title:'B',startedAt:900,endedAt:1200},{id:'v1',site:'a.com',title:'A',startedAt:0,endedAt:600}],1200,'v2'),[{site:'b.com',title:'B',onScreen:true,minutes:5},{site:'a.com',title:'A',minutesAgo:10,minutes:10}]);

// A real page --------------------------------------------------------------------------------------
const page=`<!doctype html><title>Battle Room</title><body><h1>Battle</h1><div id="log"></div>
<form id="f" onsubmit="event.preventDefault()"><label>Trainer <input id="name" name="trainer"></label><input id="pin" name="pin"><input id="otp" name="sms_code"><input id="digits" name="digits" inputmode="numeric" maxlength="6">
<label><input type="radio" name="side" value="left-unchosen"> L</label><label><input type="radio" name="side" value="right-chosen" checked> R</label><button id="go">Start battle</button></form>
<script>
fetch('/api/data.json').then(r=>r.json()).then(d=>{document.getElementById('log').append(d.items.join(', '));});
fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'pikachu',password:atob('aHVudGVyMg==')})});
const ws=new WebSocket('ws://'+location.host+'/socket');
ws.onopen=()=>ws.send('|/trn ash,0,'+'f00d'.repeat(30));
ws.onmessage=e=>{if(e.data[0]==='{')return;const p=document.createElement('p');p.textContent=e.data;document.getElementById('log').append(p);};
</script>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/api/data.json'){res.setHeader('Set-Cookie','session=secret-cookie');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({items:['Garchomp','Rotom-Wash'],token:'server-token'}));return;}
 if(req.url==='/members'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Members</title><body><p>Members area</p><script>setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<div>'+atob('TU9EQUxTRUNSRVQ=')+'<input autocomplete="current-password"></div>'),500)</script>`);return;}
 if(req.url==='/api/search'||req.url==='/api/member'){req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end('{"ok":true}');});return;}
 res.setHeader('Content-Type','text/html');res.end(page);
});
const sockets=new WebSocketServer({server,path:'/socket'});
sockets.on('connection',socket=>socket.on('message',()=>{socket.send('{"type":"auth","token":"ws-in-secret"}');socket.send('|move|p1a: Garchomp|Earthquake|p2a: Rotom');socket.send('|-supereffective|p2a: Rotom');socket.send('|win|Ash');}));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=(server.address() as {port:number}).port,origin=`http://127.0.0.1:${port}`;
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-web-record-'));
const ledger=new WorldLedger(folder);
const browser=await launchTestBrowser();
try{
 const tab=await browser.newPage();
 const session=await tab.context().newCDPSession(tab);
 const recorder=new WebRecorder({get url(){return tab.url();},get title(){return '';},cdp:(method,params={})=>session.send(method as any,params) as any},
  (visits,rows)=>ledger.recordWeb(visits,rows),{applet:'browser'});
 for(const method of ['Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed','Network.webSocketCreated','Network.webSocketClosed','Network.webSocketFrameReceived','Network.webSocketFrameSent','Network.eventSourceMessageReceived'])
  session.on(method as any,(params:any)=>recorder.event(method,params));
 session.on('Runtime.bindingCalled',(params:any)=>{if(params.name==='worldletRecord')recorder.observed(JSON.parse(params.payload));});
 await session.send('Network.enable');await session.send('Runtime.enable');await session.send('Runtime.addBinding',{name:'worldletRecord'});
 await tab.goto(origin+'/battle?token=abc');
 await session.send('Runtime.evaluate',{expression:'('+installWebRecorder.toString()+')()'});
 await tab.waitForFunction(()=>document.querySelectorAll('#log p').length===3);
 await tab.fill('#name','Ash Ketchum');await tab.fill('#pin','hunter2');await tab.fill('#otp','135799');await tab.fill('#digits','246813');
 await tab.click('#go');
 await tab.waitForTimeout(2600);
 // A members page whose sign-in dialog appears after load: nothing more is kept from it.
 await tab.goto(origin+'/members');
 await session.send('Runtime.evaluate',{expression:'('+installWebRecorder.toString()+')()'});
 await tab.waitForTimeout(2600);
 await tab.evaluate(()=>fetch('/api/member',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'user='+atob('TUVNQkVSVVNFUg==')}));
 await tab.waitForTimeout(300);
 recorder.flush();

 const found=ledger.webVisits({terms:['Earthquake'],before:Date.now()/1000+10});
 assert.equal(found.total,1,'a search finds the visit by what the WebSocket said');
 const read=ledger.webRecords(found.visits[0].id);
 const text=webTranscript(found.visits[0],read.records as WebRecord[],{total:read.total}).text;
 for(const expected of ['WebSocket received:\n|move|p1a: Garchomp|Earthquake|p2a: Rotom','|win|Ash','Garchomp','"query":"pikachu"','Typed into Trainer: Ash Ketchum','Clicked “Start battle”','Page text','token=%5Bhidden%5D','R: right-chosen'])
  assert.ok(text.includes(expected),'the recording reads back with '+JSON.stringify(expected)+'\n'+text);
 assert.ok(!text.includes(': left-unchosen'),'an unchecked radio is not part of a submitted form');
 const database=fs.readFileSync(path.join(folder,'world.sqlite')).toString('latin1')+(fs.existsSync(path.join(folder,'world.sqlite-wal'))?fs.readFileSync(path.join(folder,'world.sqlite-wal')).toString('latin1'):'');
 for(const secret of ['hunter2','secret-cookie','server-token','f00df00df00d','ws-in-secret','135799','246813','MODALSECRET','MEMBERUSER'])assert.ok(!database.includes(secret),secret+' never reaches the database');
 assert.equal(ledger.webVisits({terms:['Garchomp'],site:'127.0.0.1',before:Date.now()/1000+10}).total,1,'search by site');
 assert.equal(ledger.recentWebVisits(5)[0].site,'127.0.0.1');
 assert.ok(ledger.webPages(found.visits[0].id).some(page=>page.url.includes('/battle')),'the visit lists its pages');
 // Raw network records expire; what the page showed and the person did stays.
 const removed=ledger.pruneWeb({rawKinds:RAW_KINDS,rawBefore:Date.now()/1000+10,maxBytes:2_000_000_000});
 assert.ok(removed>0);
 const kept=ledger.webRecords(found.visits[0].id).records.map(r=>r.kind);
 assert.ok(kept.includes('input')&&kept.includes('click')&&!kept.some(k=>RAW_KINDS.includes(k as any)),'pruning keeps page text and interactions: '+kept.join(','));
 // The person deletes recordings from Settings › Privacy (`recordings`, `deleteRecordings`); Fox cannot.
 const now=Date.now()/1000,other=(id:string,site:string,body:string)=>ledger.recordWeb([{id,site,url:'https://'+site+'/',title:site,applet:'browser',startedAt:now,endedAt:now}],[{visit:id,at:now,kind:'text',url:'https://'+site+'/',meta:{},body}]);
 other('keep-1','example.com','Snorlax sleeps');other('keep-2','play.example.com','Snorlax wakes');other('keep-3','other_site.com','Pidgey flies');other('keep-4','otherxsite.com','Pidgey lands');
 const controls={agent:false,sample:false,ledger,recorders:[] as unknown[]};
 for(const op of ['recordings','deleteRecordings'] as const){
  assert.throws(()=>manageRecordings(op,{all:true},{...controls,agent:true}),/Only the person/,'Fox cannot '+op);
  assert.throws(()=>manageRecordings(op,{all:true},{...controls,sample:true}),/practice world/);
 }
 assert.equal(ledger.webVisits({before:now+10}).total,5,'refused deletes delete nothing');
 assert.throws(()=>manageRecordings('deleteRecordings',{site:''},controls),/Choose a site/,'a delete names a site or all');
 assert.deepEqual(new Set(manageRecordings('recordings',{},controls).sites.map((s:any)=>s.site+':'+s.visits)),new Set(['127.0.0.1:1','example.com:1','play.example.com:1','other_site.com:1','otherxsite.com:1']));
 // A page still open on the site: what it holds is saved and deleted too, and the next record starts a new visit.
 let openURL=origin+'/battle';const late:any[]=[];
 const live=new WebRecorder({get url(){return openURL;},title:'',cdp:async()=>({})},(visits,rows)=>{late.push(...visits);ledger.recordWeb(visits,rows);},{applet:'browser'});
 live.observed({kind:'text',url:openURL,text:'Waiting Gengar'});
 assert.deepEqual(manageRecordings('deleteRecordings',{site:'127.0.0.1'},{...controls,recorders:[live,null,live]}),{site:'127.0.0.1',deleted:2},'the site’s visits, also one waiting in an open page');
 assert.equal(ledger.webVisits({terms:['Gengar'],before:now+10}).total+ledger.webVisits({terms:['Garchomp'],before:now+10}).total,0,'the deleted site’s text is gone from search');
 live.observed({kind:'text',url:openURL,text:'Fresh Mew'});live.flush();
 assert.notEqual(late.at(-1).id,late[0].id,'a page open on a deleted site starts a new visit');
 assert.equal(manageRecordings('deleteRecordings',{site:'https://www.Example.com/x'},controls).deleted,2,'a site and its subdomains');
 assert.deepEqual(ledger.webSites().map(s=>s.site).sort(),['127.0.0.1','other_site.com','otherxsite.com'],'only the chosen site’s rows go; `_` is not a wildcard');
 assert.equal(ledger.webVisits({terms:['Snorlax'],before:now+10}).total,0);
 assert.equal(ledger.webVisits({terms:['Pidgey'],before:now+10}).total,2,'other sites stay searchable');
 assert.equal(manageRecordings('deleteRecordings',{all:true},controls).deleted,3,'Delete all');
 assert.equal(ledger.webVisits({before:now+10}).total,0);
 const db=(ledger as any).handle;
 assert.equal(Number(db.prepare('SELECT count(*) AS n FROM web_records').get().n),0,'no records outlive their visits');
 db.exec(`INSERT INTO web_records_search(web_records_search) VALUES('integrity-check')`);
 // The host routes both operations to this one rule.
 assert.match(deviceSource,/op==='recordings'\|\|op==='deleteRecordings'\)\{[^}]*manageRecordings\(op,args,\{agent,/,'the host passes who is asking');
}finally{
 await browser.close();sockets.close();server.close();ledger.close();fs.rmSync(folder,{recursive:true,force:true});
}
console.log('PASS the built-in browser records page text, typing, clicks, network data and WebSocket messages, never secrets, Fox can search and read them, and only the person can delete one site’s or every recording');
