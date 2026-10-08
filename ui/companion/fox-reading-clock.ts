/** Two independent clocks: a held book keeps breathing while page work slows
 * to a pause during listening. Integrate the exponential velocity analytically
 * so RAF cadence and hidden-window gaps cannot restart or reverse a page. */
export function createReadingClock(initial:{pageTime?:number;rate?:number}={}){
 if(initial.pageTime!==undefined&&(!Number.isFinite(initial.pageTime)||initial.pageTime<0)||initial.rate!==undefined&&(!Number.isFinite(initial.rate)||initial.rate<0||initial.rate>1))throw Error('Invalid initial reading clock');
 const tau=120;let origin:number|undefined,anchor=0,position=initial.pageTime??0,velocity=initial.rate??1,target=1,last=-Infinity;
 const at=(now:number)=>{const dt=now-anchor,decay=Math.exp(-dt/tau);return {pageTime:position+target*dt+(velocity-target)*tau*(-Math.expm1(-dt/tau)),rate:target+(velocity-target)*decay};};
 return {
  sample(active:boolean,now:number){
   if(!Number.isFinite(now)||now<0||now<last)throw Error('Reading clock requires finite monotonic time');
   if(origin===undefined){origin=now;anchor=now;target=active?1:0;velocity=initial.rate??target;}
   const current=at(now),next=active?1:0;
   if(next!==target){position=current.pageTime;velocity=current.rate;anchor=now;target=next;}
   last=now;return {time:now-origin,pageTime:current.pageTime,rate:current.rate};
  },
  reset(){origin=undefined;anchor=0;position=initial.pageTime??0;velocity=initial.rate??1;target=1;last=-Infinity;}
 };
}
