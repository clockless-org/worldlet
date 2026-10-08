/** Arrival is newer source evidence, never opening an old message or reading history. */
export function createMailArrivalObserver(now=Date.now()){
 let initialized=false,watermark=now;const seen=new Set<string>();
 return (records:Array<{id?:string;sourceId?:string;receivedAt?:number;date?:string}>)=>{
  const arrived:string[]=[];
  for(const record of records){
   const id=record.sourceId||record.id;if(!id)continue;
   const raw=Number(record.receivedAt)||Date.parse(record.date||'');const time=raw>0&&raw<1e11?raw*1000:raw;
   const key=id+':'+time;
   if(initialized&&!seen.has(key)&&Number.isFinite(time)&&time>watermark)arrived.push(key);
   seen.add(key);
  }
  initialized=true;
  for(const record of records){const raw=Number(record.receivedAt)||Date.parse(record.date||'');const time=raw>0&&raw<1e11?raw*1000:raw;if(Number.isFinite(time))watermark=Math.max(watermark,time);}
  return arrived;
 };
}
