/** Pins reserve real places before unpinned Applets are assigned. Overflow never invents ground slots. */
export function placeApplets<T extends {id:string}>(items:readonly T[],pins:readonly (string|null)[],capacity:number){
 const slots:Array<T|null>=Array.from({length:capacity},()=>null),remaining=new Map(items.map(item=>[item.id,item]));
 for(let i=0;i<capacity;i++){const item=remaining.get(pins[i]||'');if(item){slots[i]=item;remaining.delete(item.id);}}
 for(let i=0;i<capacity;i++)if(!slots[i]&&remaining.size){const item=remaining.values().next().value!;slots[i]=item;remaining.delete(item.id);}
 return {slots,overflow:[...remaining.values()]};
}
