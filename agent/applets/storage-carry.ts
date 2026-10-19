// A page that moves between the two website engines (CEF and Electron's views, device.ts `move`)
// takes its site's localStorage along, as its cookies go (cookie-sync.ts): each engine keeps its
// own browser storage, and a site that keeps its sign-in or settings there would otherwise open
// signed out or reset after the move. The page's storage before the move is what the person just
// saw, so the new engine's copy for that origin becomes the same. IndexedDB and other storage stay
// per engine.

export const STORAGE_CARRY={bytes:2_000_000,ms:120_000,items:5000};
export type StorageItems=[string,string][];

/** What the page reported (`Object.entries(localStorage)` as JSON), or null when it is not a list of string pairs or too large to carry. */
export function carriedStorage(raw:unknown):StorageItems|null {
 let value:unknown=raw;
 if(typeof raw==='string'){if(raw.length>STORAGE_CARRY.bytes*2)return null;try{value=JSON.parse(raw);}catch{return null;}}
 if(!Array.isArray(value)||value.length>STORAGE_CARRY.items)return null;
 let size=0;
 for(const item of value){
  if(!Array.isArray(item)||item.length!==2||typeof item[0]!=='string'||typeof item[1]!=='string')return null;
  size+=item[0].length+item[1].length;if(size>STORAGE_CARRY.bytes)return null;
 }
 return value as StorageItems;
}

/** The script that reads a page's localStorage, in its isolated world. */
export const STORAGE_READ='return JSON.stringify(Object.entries(localStorage))';

/** A document script for the moved page: the first document at `origin` in that tab within STORAGE_CARRY.ms
 * makes its localStorage equal to `items`, once (a sessionStorage mark), before the site's own scripts run. */
export function storageCarryScript(origin:string,items:StorageItems,at:number,id:string){
 return `(()=>{try{if(location.origin!==${JSON.stringify(origin)}||Date.now()-${at}>${STORAGE_CARRY.ms})return;const mark=${JSON.stringify('__worldletStorageCarry:'+id)};if(sessionStorage.getItem(mark))return;sessionStorage.setItem(mark,'1');localStorage.clear();for(const [key,value] of ${JSON.stringify(items)})localStorage.setItem(key,value);}catch{}})();`;
}
