/** Decorative fields belong to a painted surface, never to task state or live content. */
export type SceneMotion={
 id:string;kind:'light'|'dust'|'motes'|'ripples'|'stars'|'mist';bounds:[number,number,number,number];color:string;count?:number;
 /** A normalized polygon inside bounds, following a shoreline or a gap between buildings. */
 clip?:Array<[number,number]>;
 /** Multiplier for the field's quiet default paint; night fields fade with the actual scene lighting. */
 strength?:number;lighting?:'day'|'night';
};
export function validateSceneMotion(value:unknown):SceneMotion[]{
 if(!Array.isArray(value)||value.length>16)throw Error('Invalid scene ambience fields');
 const ids=new Set<string>();
 for(const m of value){
  if(!m||typeof m.id!=='string'||!/^[a-z][a-z0-9-]*$/.test(m.id)||ids.has(m.id))throw Error('Invalid scene ambience identifier');ids.add(m.id);
  const r=m.bounds;
  if(!['light','dust','motes','ripples','stars','mist'].includes(m.kind)||!Array.isArray(r)||r.length!==4||!r.every(n=>Number.isFinite(n)&&n>=0&&n<=1)||r[2]<=0||r[3]<=0||r[0]+r[2]>1||r[1]+r[3]>1||!/^#[\da-f]{6}$/i.test(m.color))throw Error('Invalid scene ambience paint');
  if(m.count!==undefined&&(!Number.isInteger(m.count)||m.count<1||m.count>32))throw Error('Invalid scene ambience particle count');
  if(m.strength!==undefined&&(!Number.isFinite(m.strength)||m.strength<0||m.strength>1))throw Error('Invalid scene ambience strength');
  if(m.lighting!==undefined&&!['day','night'].includes(m.lighting))throw Error('Invalid scene ambience lighting');
  if(m.clip!==undefined){
   if(!Array.isArray(m.clip)||m.clip.length<3||m.clip.length>32||!m.clip.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))throw Error('Invalid scene ambience clip');
   const area=m.clip.reduce((a,p,i)=>{const q=m.clip[(i+1)%m.clip.length];return a+p[0]*q[1]-q[0]*p[1];},0);
   if(Math.abs(area)<.001)throw Error('Empty scene ambience clip');
  }
 }
 return value;
}
