// Sync on by default (core/applets/INTEGRATIONS.md#scheduled-service-collection): once a Service is connected its default
// read is saved and kept fresh on its own, every hour; the person's "off" on its tile stays off, through a reconnect
// too; a reconnect while it is on binds it to the new connection; a Service that is not connected gets nothing; a
// preset of the person's own under the default's name is never replaced; the tile's line says when it was updated.
// Synthetic accounts, a real temporary SQLite ledger, no network.
import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createServiceSync} from '../platform/electron/src/modules/sources/service-sync.ts';
import {SERVICE_SYNC_DEFAULTS,SERVICE_SYNC_DEFAULT_MINUTES,serviceSyncDefaultId,serviceSyncDefaultStep,serviceSyncLine} from '../context/context/index.ts';
import type {ServiceRead} from '../contracts/services.ts';

// The tile's words.
assert.equal(serviceSyncLine(null,1000),'Not kept up to date.');
assert.equal(serviceSyncLine({check:{enabled:false},snapshotAt:900},1000),'Not kept up to date.');
assert.equal(serviceSyncLine({check:{enabled:true},snapshotAt:null},1000),'Not updated yet.');
assert.equal(serviceSyncLine({check:{enabled:true,lastStatus:'running'},snapshotAt:null},1000),'Updating…');
assert.equal(serviceSyncLine({check:{enabled:true,lastStatus:'complete'},snapshotAt:1000-30},1000),'Updated just now.');
assert.equal(serviceSyncLine({check:{enabled:true,lastStatus:'complete'},snapshotAt:1000-300},1000),'Updated 5 minutes ago.');
assert.equal(serviceSyncLine({check:{enabled:true,lastStatus:'complete'},snapshotAt:1000-60},1000),'Updated 1 minute ago.');
assert.equal(serviceSyncLine({check:{enabled:true,lastStatus:'complete'},snapshotAt:1000},1000+3700),'Updated 1 hour ago.');
assert.equal(serviceSyncLine({check:{enabled:true,lastStatus:'error'},snapshotAt:1000-300},1000),'Could not update just now; last updated 5 minutes ago. It tries again soon.');
assert.deepEqual([serviceSyncDefaultStep(null,'a'),serviceSyncDefaultStep({check:{enabled:true},binding:'a'} as any,'a'),serviceSyncDefaultStep({check:{enabled:true},binding:'a'} as any,'b'),serviceSyncDefaultStep({check:{enabled:false},binding:'a'} as any,'b')],['start','none','rebind','none']);
assert.deepEqual(Object.keys(SERVICE_SYNC_DEFAULTS).sort(),['cloudflare','github','posthog','search-console']);
assert.equal(SERVICE_SYNC_DEFAULT_MINUTES,60);

await withTempDir('worldlet-service-sync-default-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=1_800_000_000;
 // Which Services are connected, and with which account.
 const connected=new Map<string,string>();
 const asked:ServiceRead[]=[];
 const sync=createServiceSync({ledger:()=>ledger,authorize:preset=>connected.has(preset.provider)?{binding:connected.get(preset.provider)!,version:'1'}:null,
  read:async request=>{asked.push(request);return {provider:request.provider,operation:request.operation,scope:'Synthetic',records:[{id:'r1',title:'One',url:'https://example.com/1',fields:{}}]};},now:()=>clock});
 const job=(provider:string)=>ledger.value('service-sync-jobs',serviceSyncDefaultId(provider)) as any;

 // Nothing connected: nothing saved or scheduled.
 assert.equal(sync.ensureDefaults(),false);
 assert.deepEqual([ledger.servicePresets().length,ledger.records('service-sync-jobs').length],[0,0]);

 // GitHub connects: its default read is saved and on, every hour, and the next tick reads it.
 connected.set('github','account-a');
 assert.equal(sync.ensureDefaults(),true);
 assert.deepEqual(ledger.servicePresets().map((p:any)=>[p.id,p.provider,p.read.operation]),[['github-updates','github','list']]);
 assert.deepEqual([job('github').check.enabled,job('github').check.intervalMinutes,job('github').binding],[true,60,'account-a']);
 assert.equal(sync.ensureDefaults(),false,'once is enough');
 assert.equal(await sync.tick(),true);
 assert.deepEqual(asked.map(r=>[r.provider,r.operation]),[['github','list']]);
 const listed=(sync.handle({operation:'list'}) as any).jobs.find((j:any)=>j.id==='github-updates');
 assert.deepEqual([listed.default,listed.available,listed.snapshotAt],[true,true,clock]);
 assert.equal(serviceSyncLine(listed,clock+300),'Updated 5 minutes ago.');

 // Reconnected with another account while on: bound to it again, so it keeps running.
 connected.set('github','account-b');
 assert.equal(sync.ensureDefaults(),true);
 assert.deepEqual([job('github').binding,job('github').check.enabled],['account-b',true]);

 // The person turns it off on the tile: it stays off, through another reconnect.
 sync.handle({operation:'configure',id:'github-updates',enabled:false});
 connected.set('github','account-c');
 assert.equal(sync.ensureDefaults(),false);
 assert.deepEqual([job('github').binding,job('github').check.enabled],['account-b',false]);
 // And back on from the tile, with the current connection.
 sync.handle({operation:'configure',id:'github-updates',enabled:true});
 assert.deepEqual([job('github').binding,job('github').check.enabled],['account-c',true]);

 // A preset of the person's own named like a default (another Service) is left as it is.
 ledger.saveServicePreset({id:'posthog-updates',name:'Mine',provider:'cloudflare',read:{operation:'read',id:'zones'},createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'});
 connected.set('posthog','project-1');connected.set('cloudflare','account-1');connected.set('search-console','sa-1');
 assert.equal(sync.ensureDefaults(),true);
 assert.equal(job('posthog'),null,'not replaced');
 assert.deepEqual([job('cloudflare').preset.read,job('search-console').preset.read],[{operation:'read',id:'workers'},{operation:'list'}]);
 assert.equal((ledger.servicePresets().find((p:any)=>p.id==='posthog-updates') as any).name,'Mine');

 // A new account's data replaces the old: read again before it is disconnected.
 for(let i=0;i<5&&!ledger.value('service-sync-snapshots','github-updates');i++)await sync.tick();
 // Disconnected: it pauses (no read), and keeps what was saved.
 connected.delete('github');clock+=3600;asked.length=0;
 await sync.tick();await sync.tick();await sync.tick();
 assert.ok(!asked.some(r=>r.provider==='github'),'a disconnected Service is not read');
 assert.ok(ledger.value('service-sync-snapshots','github-updates'),'what was saved stays');
 sync.stop();ledger.close();
});
console.log('PASS Service sync on by default: a connected Service\'s default read saved and kept fresh every hour, rebound on reconnect while on, off stays off, a person\'s own preset never replaced, paused when disconnected, "Updated 5 minutes ago" on the tile');
