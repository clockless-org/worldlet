import {utf8Length} from './companion-text.ts';
import type {CompanionArchive} from '../../contracts/companion.ts';
/** Explicit user edits pin a memory section; runtime checkpoints cannot undo them. */
export function applyMemoryEdits(archive:CompanionArchive,edits:unknown):CompanionArchive {
 if(!edits||typeof edits!=='object'||Array.isArray(edits))throw Error('Invalid memory edits.');
 const map=edits as Record<string,unknown>;
 if(Object.keys(map).some(k=>!['user','longTerm'].includes(k)||typeof map[k]!=='string'||utf8Length(map[k] as string)>1_000_000))throw Error('Invalid memory section.');
 return {...archive,memories:[...archive.memories.filter(m=>!Object.hasOwn(map,m.kind)),...Object.entries(map).map(([kind,text])=>({id:'hermes-'+kind,kind,text:text as string,source:'User-managed memory'}))]};
}
