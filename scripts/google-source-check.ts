// The World's own Google connection as every Agent's source access (platform/electron/src/modules/sources/google-source.ts),
// on the development mock account: World service tools read Mail and Calendar through the turn's own permission and
// receipts, a mail draft opens its review, Applet reads and refreshes answer without any Harness, other sources still
// go to the account owner's runtime, and a mock sign-in connects Mail and Calendar under the account owner's transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ExecutionJournal} from '../platform/electron/src/modules/agent-runtime/journal.ts';
import {GoogleAccount} from '../platform/electron/src/modules/sources/google-account.ts';
import {GoogleSource,GoogleSourceAccess,GoogleSourceConnections} from '../platform/electron/src/modules/sources/google-source.ts';
import {withTempDir} from './test-temp.ts';

await withTempDir('worldlet-google-source-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const own=path.join(temp,'hermes');fs.mkdirSync(own);
 const account=new GoogleAccount({folder:path.join(temp,'accounts','google'),vault,clientFile:()=>null,adoptFrom:()=>[own]});
 const google=new GoogleSource({account,development:true,openExternal:async()=>{},ownProfile:()=>own,legacyHomes:()=>[own]});
 const delegated:any[]=[];
 const fallback={run:async(body:any)=>{delegated.push(body);return {ok:true,from:'owner'};},steer:async()=>false,cancel(){}};
 const access=new GoogleSourceAccess(google,()=>fallback);
 const links=new GoogleSourceConnections(google,()=>({providers:()=>['notion'],cancel(){},connect:async()=>{delegated.push('connect');},disconnect:async()=>['notion'],clientReady:async()=>true,configureClient:async()=>{}}),()=>'hermes');

 // Not connected: a Gmail read says so, the build has no Google client here.
 await assert.rejects(access.run({action:'sourceRequest',provider:'gmail',operation:'read'},own),/Connect Google first/);
 assert.equal(await links.clientReady('gmail',own),false);
 // A mock sign-in (development only) connects Mail and Calendar under the account owner's transport.
 const connected:any[]=[];
 await links.connect({provider:'gmail',target:'',endpoint:'',token:'',home:own,mock:true,onStage(){},onConnected:c=>connected.push(c)});
 assert.deepEqual(connected.map(c=>[c.provider,c.target,c.transport,c.connector]),[['gmail','you@worldlet.test','hermes','oauth'],['google-calendar','Calendar','hermes','oauth']]);
 assert.deepEqual(await access.run({action:'sourceRequest',provider:'gmail',operation:'access'},own),{canSend:false});

 // An Applet's Mail read and a refresh answer from the World, with no Harness.
 const mail=await access.run({action:'sourceRequest',provider:'gmail',operation:'read',threads:true},own);
 assert.equal(mail.ok,true);assert.equal(mail.label,'you@worldlet.test');assert.equal(mail.records.length,12);
 assert.match(mail.records[0].id,/^thread:/);assert.equal(mail.records[0].data.userEmail,'you@worldlet.test');
 const calendar=await access.run({action:'sourceRefresh',provider:'google-calendar'},own);
 assert.equal(calendar.records.length,4);assert.match(calendar.scope,/Next 30 days/);
 await assert.rejects(access.run({action:'sourceRequest',provider:'google-drive',operation:'read'},own),/Mail and Calendar only/);
 assert.deepEqual(delegated,[]);

 // read_world_source through the turn: authorized, admitted, recorded; records normalized for the model.
 const calls:any[]=[];
 const turn=async(event:any)=>{
  calls.push([event.name,event.args]);
  if(event.name==='_world_authorize')return {ok:true};
  if(event.name==='_source_begin')return {ticket:'t-1'};
  if(event.name==='_source_result')return {ok:true};
  if(event.name==='_email_review')return {review:event.args};
  return null;
 };
 const page=await access.run({action:'sourceTool',name:'read_world_source',args:{provider:'gmail',unreadOnly:true}},own,turn);
 assert.deepEqual(calls.map(call=>call[0]),['_world_authorize','_source_begin','_source_result']);
 assert.deepEqual(calls[0][1],{name:'read_world_source'});
 assert.equal(page.unreadOnly,true);assert.ok(page.records.length>=1&&page.records.every((r:any)=>r.unread===true&&r.provider==='gmail'));
 assert.match(page.records[0].text,/^Thread, newest first\. User: you@worldlet\.test/);
 assert.equal(calls[2][1].ticket,'t-1');assert.equal(calls[2][1].records,page.records);
 // The run is journaled like any Agent runtime's, so the turn's record shows the read and its receipt.
 const journaled:any[]=[];
 ExecutionJournal.register(own,true,entry=>{journaled.push(entry);return true;});
 calls.length=0;
 await access.run({action:'sourceTool',name:'read_world_source',args:{provider:'gmail',unreadOnly:true}},own,turn);
 ExecutionJournal.register(own,false,()=>true);
 assert.deepEqual(journaled.map(entry=>entry.event.kind==='tool.requested'?entry.payload.name:entry.event.kind),['run.started','_world_authorize','tool.result','_source_begin','tool.result','_source_result','tool.result','run.succeeded']);
 // A failed read is recorded as failed and says only its kind.
 calls.length=0;
 await assert.rejects(access.run({action:'sourceTool',name:'read_world_source',args:{provider:'gmail',id:'thread:ffffffffffffffff'}},own,turn),/temporarily unavailable/);
 assert.deepEqual(calls.at(-1),['_source_result',{provider:'gmail',ticket:'t-1',failed:true}]);
 // Arguments are validated against the World tool's schema, and a refused permission stops the read.
 await assert.rejects(access.run({action:'sourceTool',name:'read_world_source',args:{provider:'gmail',extra:1}},own,turn),/Invalid arguments for read_world_source/);
 await assert.rejects(access.run({action:'sourceTool',name:'read_world_source',args:{provider:'gmail'}},own,async()=>({error:'Allow private context first.'})),/Allow private context first/);

 // A reply draft opens its review in Fox; it never sends.
 calls.length=0;
 const review=await access.run({action:'sourceTool',name:'prepare_email',args:{subject:'Re: Dinner',body:'Hi Sam, count me in!',threadId:'e8b1e8b1e8b1e8b1'}},own,turn);
 assert.deepEqual(calls.map(call=>call[0]),['_world_authorize','_email_review']);
 assert.equal(review.review.to,'sam.okafor@example.com');assert.equal(review.review.subject,'Dinner Saturday?');assert.equal(review.review.from,'you@worldlet.test');

 // Notion and every other source still go to the account owner's runtime.
 await access.run({action:'sourceTool',name:'read_world_source',args:{provider:'notion'}},own,turn);
 await access.run({action:'sourceRequest',provider:'notion',operation:'list'},own);
 assert.equal(delegated.length,2);
 await links.connect({provider:'notion',target:'',endpoint:'',token:'',home:own,onStage(){},onConnected(){}});
 assert.equal(delegated.at(-1),'connect');

 // Disconnecting Mail forgets the World's Google connection (Mail, Calendar and Drive).
 assert.deepEqual(await links.disconnect({provider:'gmail',connector:'oauth'},own),['gmail','google-calendar','google-drive']);
 assert.equal(google.authorized(),false);
});
console.log('PASS World Google source access: mock sign-in, Applet reads and refreshes, read_world_source with authorization and receipts, mail review, other sources delegated, disconnect');
