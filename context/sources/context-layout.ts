export interface ContextPlace {theme:string;title:string;position:number[];scale:number;accent:string}
export interface ContextLayout {places:ContextPlace[];message:string}
const names={home:'Home',library:'Library',studio:'Creative studio',factory:'Workshop',cafe:'Gathering place',family:'Family nook',calendar:'Memory garden',finance:'Finance lodge',archive:'Archive',rocket:'Travel camp',health:'Wellness garden',vision:'Lookout'};
const themes=Object.keys(names);
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function previousLayout(value:unknown):ContextLayout|undefined {
 if(typeof value!=='string')return;
 try {
  const v=JSON.parse(value);
  if(!record(v)||typeof v.message!=='string'||!Array.isArray(v.places)||!v.places.every(p=>record(p)&&typeof p.theme==='string'&&typeof p.title==='string'&&typeof p.accent==='string'&&typeof p.scale==='number'&&Number.isFinite(p.scale)&&Array.isArray(p.position)&&p.position.every(n=>typeof n==='number'&&Number.isFinite(n))))return;
  return v as unknown as ContextLayout;
 }catch{return;}
}
/** Deterministic context placement, independent of the model and native renderer. */
export function contextLayout(value:unknown):ContextLayout {
 if(!record(value)||!Array.isArray(value.themes)||!value.themes.every(record))throw Error('Invalid layout context.');
 const expected=new Set(value.themes.flatMap(v=>typeof v.theme==='string'?[v.theme]:[]));expected.add('home');
 if([...expected].some(theme=>!themes.includes(theme)))throw Error('Unsupported theme.');
 const previous=previousLayout(value.previous);
 const oldThemes=new Set(previous?.places.map(p=>p.theme)??[]);
 const ordered=[...themes.filter(t=>expected.has(t)&&oldThemes.has(t)),...themes.filter(t=>expected.has(t)&&!oldThemes.has(t))];
 const slots=[0,15,-15,30].flatMap(x=>[2,17,-13,-28].map(z=>[x,0,z]));
 const places:ContextPlace[]=[];
 const valid=(p:number[])=>p.length===3&&p.every(Number.isFinite)&&p[1]===0&&p[0]>-18&&p[0]<=32&&Math.abs(p[2])<=30&&!places.some(old=>Math.hypot(old.position[0]-p[0],old.position[2]-p[2])<12);
 for(const theme of ordered){
  const candidate=previous?.places.find(p=>p.theme===theme)?.position;
  const position=candidate&&valid(candidate)?candidate:slots.find(valid);
  if(!position)throw Error('No available layout space.');
  places.push({theme,title:names[theme],position:[...position],scale:1,accent:'#708C80'});
 }
 return {places,message:'Your context is organized into familiar places.'};
}
