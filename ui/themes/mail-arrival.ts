/** Arrival is newer source evidence, never opening an old message or reading history. */
export function createMailArrivalObserver(now=Date.now()){
 let initialized=false,watermark=now;const seen=new Set<string>();
 return (records:Array<{id?:string;sourceId?:string;receivedAt?:number;date?:string}>)=>{
  const arrived:string[]=[];let latest=watermark;
  for(const record of records){
   const raw=Number(record.receivedAt)||Date.parse(record.date||'');const time=raw>0&&raw<1e11?raw*1000:raw;
   // Every dated record moves the watermark, but only after this whole batch is compared with the old one.
   if(Number.isFinite(time))latest=Math.max(latest,time);
   const id=record.sourceId||record.id;if(!id)continue;
   const key=id+':'+time;
   if(initialized&&!seen.has(key)&&Number.isFinite(time)&&time>watermark)arrived.push(key);
   seen.add(key);
  }
  initialized=true;watermark=latest;
  return arrived;
 };
}
