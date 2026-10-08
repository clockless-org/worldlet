// The state of this world right now, as one thing.
//
// Fox should not need a tool to learn what time it is, what the weather is doing
// or what is playing. A tool per fact is a round trip per fact, and the facts are
// tiny. So the world's present travels with every turn, assembled here.
//
// Two rules keep it from turning into a dump:
//
//   Read the interface, not a second copy of the world. Everything below comes
//   from what is actually on screen, so Fox is told what the user can see.
//
//   State, not contents. How many things are waiting, not what they say; which
//   page is open, not its text. Contents are large, they change constantly, and
//   there are tools for them. History is the same and stays behind
//   read_world_history.
//
// To give Fox another fact about the world, add a line to FACTS.
const clean=(value,size=64)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,size);

const FACTS: [string,(d: Document,now: Date)=>string][]=[
 // The clock the user is reading, and the instant a machine can compare against,
 // because "9:41 PM" cannot answer a question about a flight.
 ['now',(d,now)=>clean(now.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))],
 ['instant',(d,now)=>now.toISOString()],
 // The weather status can say "Check weather" or "Loading weather…".
 // These are not facts about the sky and must not come back as a forecast.
 ['weather',d=>{const value=clean(d.querySelector('#worldWeather')?.textContent);return /\d\s*°/.test(value)?value:'';}],
 ['sound',d=>{const b=d.querySelector<HTMLElement>('.world-audio-current');if(!b)return '';
  return b.dataset.on==='true'?clean(b.dataset.playing)+' playing':'off';}],
 // What the Attention Center is holding, counted. What each one says is already
 // on the user's screen and is theirs to raise, not Fox's to recite.
 ['waiting',d=>{
  const groups=[...d.querySelectorAll('.world-task-group')].map(g=>{
   const name=clean(g.querySelector('.world-task-heading')?.textContent,24).toLowerCase();
   return [name,g.querySelectorAll('.world-matter').length];
  }).filter(([name,n])=>name&&n);
  return groups.length?clean(groups.map(([name,n])=>n+' '+name).join(', '),96):'nothing waiting';
 }],
 // A world the user is only visiting. Fox must never present it as their own life.
 ['mode',d=>d.querySelector<HTMLElement>('.native-console')?.dataset.sample==='true'?'sample world, not the user’s real sources':''],
 // The page the reader or the built-in browser is showing, by name only.
 ['showing',d=>clean(d.querySelector('.browser-caption')?.textContent
  ||d.querySelector('#notionContent:not([hidden]) h1, #notionContent:not([hidden]) h2')?.textContent,96)]
];

export function worldNow(root=document,now=new Date()){
 const out={};
 for(const [key,read] of FACTS){
  let value='';
  try{value=read(root,now);}catch{value='';}
  if(value)out[key]=value;
 }
 return out;
}

export const WORLD_FACTS=FACTS.map(([key])=>key);
