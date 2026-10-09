// The Applet shelf: the recently used Applets standing above an open Applet, like tabs (owner request 2026-10-09).
// The open Applet stands in the middle, largest; the others keep one order around it, a ring, so switching slides
// the shelf to bring the chosen one to the middle and both sides always hold Applets. At most SHELF_SIZE stand
// on the shelf; the ones used longest ago wait behind "+N" at its end.

export const SHELF_SIZE=6;

export type ShelfState={order:string[]};
export type ShelfRing={visible:{id:string;offset:number}[];overflow:string[]};

// Starts the shelf from what was used last, oldest first, so the ring reads in the order the Applets were opened.
export function seedShelf(recent:string[],size=SHELF_SIZE):ShelfState{
 return {order:recent.slice(0,size).reverse()};
}

// The open Applet joins the ring at its end the first time; an Applet already on it keeps its place.
export function enterShelf(state:ShelfState,id:string):ShelfState{
 return state.order.includes(id)?state:{order:[...state.order,id]};
}

// Closing takes an Applet off the ring; the neighbour after it (or before it, at the end) opens in its place
// when it was the open one, and nothing when it was the last.
export function closeOnShelf(state:ShelfState,id:string,current:string|null):{state:ShelfState;next:string|null}{
 const index=state.order.indexOf(id);if(index<0)return {state,next:current};
 const order=state.order.filter(x=>x!==id);
 if(id!==current)return {state:{order},next:current};
 return {state:{order},next:order[index]??order[index-1]??null};
}

// The ring around the open Applet. `lastUsed` ranks the ones that stay when more than `size` are on it; the rest,
// most recently used first, are the shelf's "+N". Offsets are signed steps from the middle, balanced on both sides
// (the extra one of an even count goes left).
export function shelfRing(state:ShelfState,current:string|null,lastUsed:(id:string)=>number,size=SHELF_SIZE):ShelfRing{
 const ranked=[...state.order].sort((a,b)=>(b===current?1:0)-(a===current?1:0)||lastUsed(b)-lastUsed(a));
 const kept=new Set(ranked.slice(0,size)),overflow=ranked.slice(size);
 const ring=state.order.filter(id=>kept.has(id)),n=ring.length,middle=current?ring.indexOf(current):-1;
 if(middle<0)return {visible:ring.map((id,i)=>({id,offset:i-Math.floor((n-1)/2)})),overflow};
 const visible=ring.map((id,i)=>{let offset=((i-middle)%n+n)%n;if(offset>n/2||(offset===n/2&&n%2===0))offset-=n;return {id,offset};});
 return {visible,overflow};
}
