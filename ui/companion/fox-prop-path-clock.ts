export type PropPathTarget=0|1|'hold';
type Motion={position:number;velocity:number;acceleration:number};
const evaluate=(points:number[],u:number):number=>{
 const p=[...points];for(let n=p.length-1;n>0;n--)for(let i=0;i<n;i++)p[i]+=(p[i+1]-p[i])*u;return p[0];
};
/** A bounded physical prop path. Retargeting preserves position, velocity and
 * acceleration; hold brakes on the same path rather than freezing a frame.
 * Evaluation is event-time based, independent of RAF cadence or hidden gaps. */
export function createPropPathClock(initial:0|1,fullTravel=6200){
 if(initial!==0&&initial!==1||!Number.isFinite(fullTravel)||fullTravel<=0)throw Error('Invalid prop path configuration');
 type Segment={anchor:number;duration:number;points:number[]};
 let target:PropPathTarget=initial,last=-Infinity;
 let segments:Segment[]=[{anchor:0,duration:0,points:Array(6).fill(initial)}];
 const at=(now:number):Motion=>{
  const {anchor,duration,points}=segments.find(s=>now<s.anchor+s.duration)??segments[segments.length-1];
  if(!duration||now>=anchor+duration)return {position:points[5],velocity:0,acceleration:0};
  const u=(now-anchor)/duration,d1=points.slice(1).map((p,i)=>5*(p-points[i])/duration),d2=d1.slice(1).map((p,i)=>4*(p-d1[i])/duration);
  return {position:evaluate(points,u),velocity:evaluate(d1,u),acceleration:evaluate(d2,u)};
 };
 return (next:PropPathTarget,now:number,reduced=false)=>{
  if(next!==0&&next!==1&&next!=='hold')throw Error('Invalid prop path target');
  if(!Number.isFinite(now)||now<0||now<last)throw Error('Prop path requires monotonic finite time');
  const current=at(now);
  if(reduced){target=next;segments=[{anchor:now,duration:0,points:Array(6).fill(next==='hold'?current.position:next)}];}
  else if(next!==target){
   const {position:x,velocity:v,acceleration:a}=current;
   let brake=Math.abs(v)+Math.abs(a)>1e-15?350:0,candidate:number[]=[];
   for(let i=0;i<120;i++,brake*=.75){
    const stop=x+v*brake/2+a*brake*brake/12;
    candidate=[x,x+v*brake/5,x+2*v*brake/5+a*brake*brake/20,stop,stop,stop];
    if(candidate.every(p=>p>=0&&p<=1))break;
   }
   if(candidate.some(p=>p<0||p>1))throw Error('Prop path escaped its support interval');
   const stop=candidate[5],destination=next==='hold'?stop:next,travel=next==='hold'?0:Math.max(800,Math.abs(destination-stop)*fullTravel);
   segments=[...(brake?[{anchor:now,duration:brake,points:candidate}]:[]),{anchor:now+brake,duration:travel,points:[stop,stop,stop,destination,destination,destination]}];
   target=next;
  }
  const end=segments[segments.length-1];last=now;
  return {...at(now),target,complete:now>=end.anchor+end.duration,arrival:end.anchor+end.duration};
 };
}
