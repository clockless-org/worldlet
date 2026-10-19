import fs from 'node:fs';
import path from 'node:path';
import {session} from 'electron';
import {ensureDirectory} from '../../files.ts';
import {HOST_RETAINED,removeExceptRetained} from './reset-files.ts';
import type {Host} from '../../host/types.ts';
import {VAULT,type VaultService} from '../../host/services.ts';

// Mac `resetToFirstLaunch` + `preserveModelSetupDuringReset`: personal world data leaves
// the library while the installed model connection stays in place.
const PREFERENCES=['worldlet.sampleEnabled','worldlet.companionName','worldlet.spokenReplies','worldlet.talkReplies','worldlet.wakeWord','worldlet.spokenVoice','worldlet.attentionFocus','worldlet.textScale','worldlet.modelRoute','worldlet.foxModel','worldlet.companionStyle','worldlet.companionLook'];
async function clearSiteData(root:string){
 const partitions=path.join(root,'Browser','Electron','Partitions');
 const names=fs.existsSync(partitions)?fs.readdirSync(partitions):[];
 await Promise.allSettled([session.defaultSession,...names.map(name=>session.fromPartition('persist:'+name))].map(value=>value.clearStorageData()));
}

export async function resetToFirstLaunch(host:Host,retained:Set<string>){
 const {store,preferences,profile}=host;
 // Before the database closes: the World's own preferences are in it (preferences.ts), and it goes too.
 preferences.remove(...PREFERENCES);
 store.closeLedger();
 host.optional<VaultService>(VAULT)?.deleteAll();
 removeExceptRetained(profile.root,new Set([...retained,...HOST_RETAINED]));
 await clearSiteData(profile.root);
 ensureDirectory(profile.root);
 store.reload();
 store.state.autoGenerate=false;store.state.autoSync=false;store.state.automaticProcessingVersion=2;
 if(!store.state.googleClientID&&store.options.googleClientID)store.state.googleClientID=store.options.googleClientID;
 store.forgetLiveSourceContent();
 store.activityRevision=0;store.busy=false;store.organizing=false;store.error=null;store.status='Sources are stored on this computer';
 store.persist();store.notify();
}
