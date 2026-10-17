// Settings › Connectors in Core (core/accounts/connectors.ts, core/applets/connector-tiles.ts): which tiles show, each
// one's state and words from the World's connection rows, and that nothing on the default path uses a technical word.
import assert from 'node:assert/strict';
import {CONNECTORS,CONNECTOR_TECHNICAL_WORDS,connectorTiles,connectorDisconnectQuestion,connectorFailure,plainConnectorText,type ConnectorTile} from '../core/accounts/index.ts';
import {connectionLive,getApp} from '../core/applets/index.ts';

// The rule itself: each banned word, in any case, as a whole word only.
for(const word of ['key','keys','token','Tokens','scope','MCP','OAuth','API','APIs','ID','endpoint','Grant','terminal'])assert.ok(!plainConnectorText(`Paste the ${word} here`),word);
for(const text of ['Keep','Connected as alex@example.com','See your issues and projects in Linear.','Monkey','Idea','tokenless'])assert.ok(plainConnectorText(text),text);

const plain=(tiles:ConnectorTile[])=>{for(const tile of tiles)for(const text of [tile.name,tile.line])assert.doesNotMatch(text,CONNECTOR_TECHNICAL_WORDS,tile.id);};

// Nothing connected: the sign-in services, each with its purpose and Connect; key services and HTTP JSON stay away.
const empty=connectorTiles([]);
assert.deepEqual(empty.map(tile=>tile.id),['google','notion','linear','todoist','supabase','posthog','cloudflare']);
assert.ok(empty.every(tile=>tile.state==='off'&&tile.signIn));
assert.equal(empty.find(tile=>tile.id==='google')!.provider,'gmail');
assert.equal(empty.find(tile=>tile.id==='notion')!.region,'work');
plain(empty);

// Connected: by sign-in (Google with an address), by key (GitHub, PostHog) and through a Thing (PayPal).
// Rows as the World snapshot carries them (world-store.ts appletSnapshot: `label`, `connected`, `failed`).
const row=(provider:string,label:string,extra:Record<string,unknown>={})=>({provider,label,transport:'hermes',syncStatus:'connected',connected:true,failed:false,...extra});
const rows=[
 row('gmail','alex@example.com'),
 row('google-calendar','Calendar',{transport:'native'}),
 row('notion','Notion'),
 row('linear','Linear',{syncStatus:'sync_error',failed:true,syncError:'Linear is disconnected. Reconnect with Fox.'}),
 row('todoist','Todoist',{syncStatus:'sync_error',failed:true,syncError:'Todoist took too long to answer. Try again.'}),
 row('github','GitHub'),
 {provider:'posthog',target:'PostHog',status:'connected'},
 row('cloudflare','Cloudflare',{connected:false}),
 row('paypal','PayPal'),
 row('http','status'),
];
const tiles=connectorTiles(rows),by=(id:string)=>tiles.find(tile=>tile.id===id)!;
assert.deepEqual(tiles.map(tile=>tile.id),['google','notion','linear','todoist','supabase','paypal','github','posthog','cloudflare'],'key services show once connected; HTTP JSON never');
assert.deepEqual([by('google').state,by('google').line],['connected','Connected as alex@example.com']);
assert.deepEqual([by('notion').state,by('notion').line],['connected','Connected'],'a target that is only the service\'s name says Connected');
assert.deepEqual([by('linear').state,by('linear').line],['needs-you','Linear signed you out. Sign in again to keep seeing it here.']);
assert.equal(by('todoist').state,'connected','a slow read is not a sign-out');
assert.deepEqual([by('github').state,by('github').signIn],['connected',false]);
assert.deepEqual([by('posthog').state,by('posthog').signIn],['connected',true],'PostHog signs in; a key under Advanced shows the same tile');
assert.equal(by('posthog').state,'connected');
assert.deepEqual([by('cloudflare').state,by('cloudflare').signIn],['off',true],'Cloudflare signs in too');
plain(tiles);
// Calendar read from this computer is not Google's sign-in.
assert.equal(connectorTiles([row('google-calendar','Calendar',{transport:'native'})]).find(tile=>tile.id==='google')!.state,'off');
assert.equal(connectorTiles([row('google-calendar','alex@example.com')]).find(tile=>tile.id==='google')!.provider,'google-calendar','Disconnect names the row that is connected');
// Waiting: the tile whose sign-in is open says where to finish.
const waiting=connectorTiles([],'linear').find(tile=>tile.id==='linear')!;
assert.deepEqual([waiting.state,waiting.line],['waiting','Finish signing in on Linear, then come back here.']);
// A key service never asks again: GitHub signed out stays Connected (its key is replaced under Advanced).
assert.equal(connectorTiles([row('github','GitHub',{syncStatus:'sync_error',failed:true,syncError:'GitHub is disconnected. Reconnect.'})]).find(tile=>tile.id==='github')!.state,'connected');

// Plain words for Disconnect and a failed Connect; the host's own words only when they are plain.
assert.equal(connectorDisconnectQuestion('Notion'),'Worldlet will stop seeing your Notion. What it already saved stays.');
assert.equal(connectorFailure('Notion','Sign-in was cancelled.'),'Sign-in was cancelled. Nothing changed.');
assert.equal(connectorFailure('Notion','Sign-in timed out. Try again.'),'Signing in to Notion took too long. Try again.');
assert.equal(connectorFailure('Notion','This service does not let Worldlet register to sign in. Connect it with a token instead.'),'Could not connect Notion. Try again.');
assert.equal(connectorFailure('Notion','Could not reach the service to sign in. Check your internet connection and try again.'),'Could not reach the service to sign in. Check your internet connection and try again.');
assert.equal(connectorFailure('Notion',undefined),'Could not connect Notion. Try again.');

// The registry: every purpose line plain, ids unique.
assert.equal(new Set(CONNECTORS.map(item=>item.id)).size,CONNECTORS.length);
for(const item of CONNECTORS){
 assert.ok(plainConnectorText(item.name+' '+item.purpose),item.id);
 // A connection made in Settings lands where its Thing lives.
 const app=getApp(item.providers[0]);
 if(app)assert.equal(item.region,app.region,item.id+' region');
}
// Connected means what the rest of the World means by it (core/applets connectionLive).
for(const value of rows)assert.equal(connectorTiles([value]).some(tile=>tile.state!=='off'&&tile.provider===value.provider),connectionLive(value)&&value.provider!=='http'&&!(value.provider==='google-calendar'&&(value as {transport?:string}).transport==='native'),value.provider);
console.log('PASS Connectors in Core: sign-in tiles always, key services once connected, HTTP JSON only under Advanced, connected/needs-you/waiting states, plain words on the default path');
