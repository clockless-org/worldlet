import fs from 'node:fs';
import path from 'node:path';
import type {Host} from '../../types.ts';
import type {LocalDataFacts} from '../../../../agent/app/index.ts';
import {discoverHermes} from '../companion/agent/hermes-files.ts';
import {openClawState} from '../companion/agent/openclaw-config.ts';
import {openClawAgents} from '../companion/agent/openclaw-files.ts';

// What `local_data_size` reports (agent/app/data-size.ts): file sizes and two cheap counts, never a name or a
// path. The recordings' size is the one the browser's tidy counted a minute after start (WorldLedger.webRecordBytes).
const size=(file:string)=>{try{return fs.statSync(file).size;}catch{return 0;}};
const database=(file:string)=>size(file)+size(file+'-wal');

export function localDataFacts(host:Host):LocalDataFacts|null {
 const {store}=host;
 if(!store.writable||store.sampleEnabled())return null;
 const ledger=store.ledger();
 let hermes:number|null=null;
 try{const root=discoverHermes();if(root)hermes=database(path.join(root,'state.db'));}catch{}
 let openclaw:number|null=null;
 try{const state=openClawState(),agents=openClawAgents();if(agents.length)openclaw=agents.reduce((sum,agent)=>sum+database(path.join(state,'agents',agent.id,'agent','openclaw-agent.sqlite')),0);}catch{}
 let free:number|null=null;
 try{const disk=fs.statfsSync(store.root);free=disk.bavail*disk.bsize;}catch{}
 return {worldBytes:database(path.join(store.root,'world.sqlite')),recordingBytes:ledger.webRecordBytes(),eventRows:ledger.eventRows(),
  hermesBytes:hermes,openclawBytes:openclaw,diskFreeBytes:free};
}
