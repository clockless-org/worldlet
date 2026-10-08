import type {GameHost} from './core.ts';

/** A crop grows on the wall clock, not while the Applet is open: a pumpkin planted tonight is ripe tomorrow evening. */
export type Crop={key:string;name:string;minutes:number;seed:number;sell:number;color:string};
export const CROPS:readonly Crop[]=[
 {key:'radish',name:'Radish',minutes:30,seed:2,sell:4,color:'#d9607a'},
 {key:'lettuce',name:'Lettuce',minutes:4*60,seed:4,sell:10,color:'#7fb069'},
 {key:'carrot',name:'Carrot',minutes:8*60,seed:6,sell:16,color:'#e07a32'},
 {key:'tomato',name:'Tomato',minutes:12*60,seed:10,sell:28,color:'#c8453a'},
 {key:'pumpkin',name:'Pumpkin',minutes:22*60,seed:15,sell:48,color:'#e3962f'},
 {key:'strawberry',name:'Strawberry',minutes:24*60,seed:18,sell:56,color:'#d23f55'},
];
const MINUTE=60_000,START_PLOTS=6,MAX_PLOTS=12,START_COINS=10;
export type Plot={crop:string;planted:number}|null;
export type Garden={version:1;coins:number;plots:Plot[];harvested:number};

export const newGarden=():Garden=>({version:1,coins:START_COINS,plots:Array(START_PLOTS).fill(null),harvested:0});
export const crop=(key:string)=>CROPS.find(c=>c.key===key);
export const ripeAt=(plot:NonNullable<Plot>)=>plot.planted+(crop(plot.crop)?.minutes??0)*MINUTE;
/** 0 just planted, 1 sprout, 2 leafy, 3 ripe. Ripe crops wait for the gardener; nothing withers. */
export function stage(plot:Plot,now:number){
 if(!plot)return -1;const c=crop(plot.crop);if(!c)return -1;
 const p=(now-plot.planted)/(c.minutes*MINUTE);return p>=1?3:p>=2/3?2:p>=1/3?1:0;
}
export const plotPrice=(g:Garden)=>g.plots.length>=MAX_PLOTS?0:30+15*(g.plots.length-START_PLOTS);
export const ripeCount=(g:Garden,now:number)=>g.plots.filter(p=>stage(p,now)===3).length;
export function nextRipe(g:Garden,now:number){
 let next=0;for(const p of g.plots)if(p&&stage(p,now)<3){const t=ripeAt(p);if(!next||t<next)next=t;}
 return next;
}
export function plant(g:Garden,i:number,key:string,now:number){
 const c=crop(key);if(!c||i<0||i>=g.plots.length||g.plots[i]||g.coins<c.seed)return false;
 g.coins-=c.seed;g.plots[i]={crop:key,planted:now};return true;
}
export function harvest(g:Garden,i:number,now:number){
 const p=g.plots[i];if(!p||stage(p,now)!==3)return 0;
 const value=crop(p.crop)!.sell;g.coins+=value;g.harvested++;g.plots[i]=null;return value;
}
export function buyPlot(g:Garden){
 const price=plotPrice(g);if(!price||g.coins<price)return false;
 g.coins-=price;g.plots.push(null);return true;
}
/** A saved garden from older or damaged storage becomes a valid one; unknown crops are dropped. */
export function restoreGarden(value:unknown):Garden{
 const g=newGarden();if(!value||typeof value!=='object')return g;const v=value as Record<string,unknown>;
 if(Number.isFinite(v.coins)&&(v.coins as number)>=0)g.coins=Math.floor(v.coins as number);
 if(Number.isFinite(v.harvested)&&(v.harvested as number)>=0)g.harvested=Math.floor(v.harvested as number);
 if(Array.isArray(v.plots)&&v.plots.length>=START_PLOTS)g.plots=v.plots.slice(0,MAX_PLOTS).map(p=>p&&typeof p==='object'&&crop((p as any).crop)&&Number.isFinite((p as any).planted)?{crop:(p as any).crop,planted:(p as any).planted}:null);
 return g;
}
/** When something will be ripe, in words: "in 25 min", "7:40 PM", "tomorrow 7:40 AM", "Sat 9:15 AM". */
export function whenText(at:number,now:number){
 const left=at-now;if(left<=0)return 'now';
 if(left<60*MINUTE)return `in ${Math.max(1,Math.ceil(left/MINUTE))} min`;
 const d=new Date(at),today=new Date(now),time=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).replace(/\s/g,' ');
 const day=(x:Date)=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime(),days=Math.round((day(d)-day(today))/864e5);
 return days===0?time:days===1?`tomorrow ${time}`:`${d.toLocaleDateString('en-US',{weekday:'short'})} ${time}`;
}
const hours=(m:number)=>m<60?`${m} min`:`${m/60} h`;

// Each crop is drawn from a few soft shapes in the Village palette; the stages share leaves.
const leaves=(s:number,y:number)=>`<path d="M32 ${y}c-${8*s} -${4*s} -${12*s} -${12*s} -${10*s} -${18*s}c${7*s} 1 ${10*s} ${8*s} ${10*s} ${18*s}Z" fill="#5c9a7b"/><path d="M32 ${y}c${8*s} -${4*s} ${12*s} -${12*s} ${10*s} -${18*s}c-${7*s} 1 -${10*s} ${8*s} -${10*s} ${18*s}Z" fill="#7fb069"/>`;
const fruit:Record<string,(c:string)=>string>={
 radish:c=>`<circle cx="32" cy="42" r="12" fill="${c}"/><path d="M32 54v6" stroke="#b9c4a0" stroke-width="2" stroke-linecap="round"/>`,
 lettuce:c=>`<circle cx="32" cy="40" r="15" fill="#5c9a7b"/><circle cx="26" cy="38" r="9" fill="${c}"/><circle cx="38" cy="38" r="9" fill="${c}"/><circle cx="32" cy="34" r="8" fill="#a6cf8a"/>`,
 carrot:c=>`<path d="M22 30h20l-10 30Z" fill="${c}" stroke-linejoin="round"/><path d="M26 38h6m-4 8h5" stroke="#b85a22" stroke-width="2" stroke-linecap="round"/>`,
 tomato:c=>`<circle cx="32" cy="42" r="14" fill="${c}"/><path d="M25 30l7 4 7-4-3 6h-8Z" fill="#3f7f4f"/><circle cx="27" cy="38" r="3" fill="#ffffff55"/>`,
 pumpkin:c=>`<ellipse cx="32" cy="43" rx="19" ry="13" fill="${c}"/><path d="M25 32c-3 6-3 16 0 23m14-23c3 6 3 16 0 23" stroke="#c4741f" stroke-width="2" fill="none"/><path d="M32 30v-5" stroke="#6b4a2e" stroke-width="4" stroke-linecap="round"/>`,
 strawberry:c=>`<path d="M20 34c0-4 24-4 24 0 0 10-6 22-12 24-6-2-12-14-12-24Z" fill="${c}"/><path d="M24 33l8-5 8 5-8 2Z" fill="#3f7f4f"/><circle cx="28" cy="41" r="1.4" fill="#f6e7a8"/><circle cx="36" cy="44" r="1.4" fill="#f6e7a8"/><circle cx="31" cy="50" r="1.4" fill="#f6e7a8"/>`,
};
export function cropArt(key:string,growth:number){
 const c=crop(key);if(!c)return '';
 const body=growth===0?`<path d="M32 58v-6" stroke="#5c9a7b" stroke-width="3" stroke-linecap="round"/>${leaves(.5,52)}`
  :growth===1?`<path d="M32 58v-10" stroke="#5c9a7b" stroke-width="3" stroke-linecap="round"/>${leaves(1,48)}`
  :growth===2?`${leaves(1.1,40)}<g transform="translate(16 18) scale(.5)">${fruit[key](c.color)}</g>`
  :`${leaves(.9,32)}${fruit[key](c.color)}`;
 return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

/** Storage for the garden; the app keeps it in this computer's local storage beside the other games. */
export type GardenStore={load:()=>unknown;save:(g:Garden)=>void};
export function localGardenStore(name='worldlet-garden-v1'):GardenStore{
 return {load(){try{return JSON.parse(localStorage.getItem(name)||'null');}catch{return null;}},save(g){try{localStorage.setItem(name,JSON.stringify(g));}catch{}}};
}

/**
 * Garden: plant a seed, come back when it is ripe. Crops take from half an hour to a day,
 * on the real clock. While the panel is open one timer wakes at the next minute or ripening;
 * a closed garden runs nothing and works out the crops from their planting times.
 */
export function createGarden(host:GameHost,{store=localGardenStore(),now=()=>Date.now()}:{store?:GardenStore;now?:()=>number}={}){
 let g=restoreGarden(store.load()),seed=CROPS[0].key,timer:ReturnType<typeof setTimeout>|0=0,note='';
 const root=document.createElement('div');root.className='garden-game';
 const board=document.createElement('div');board.className='game-board garden-board';board.tabIndex=0;board.setAttribute('role','grid');board.setAttribute('aria-label','Garden plots');
 const tray=document.createElement('div');tray.className='garden-tray';tray.setAttribute('role','radiogroup');tray.setAttribute('aria-label','Seeds');
 root.append(board,tray);
 const save=()=>store.save(g);
 function drawTray(){
  tray.replaceChildren(...CROPS.map(c=>{
   const b=document.createElement('button');b.type='button';b.className='garden-seed';b.dataset.crop=c.key;
   b.setAttribute('role','radio');b.setAttribute('aria-checked',String(c.key===seed));b.disabled=g.coins<c.seed;
   b.innerHTML=`${cropArt(c.key,3)}<strong>${c.name}</strong><small>${hours(c.minutes)} · ${c.seed} → ${c.sell} coins</small>`;
   b.title=`${c.name}: ripe ${hours(c.minutes)} after planting. Seed ${c.seed} coins, sells for ${c.sell}.`;
   b.addEventListener('click',()=>{seed=c.key;draw();});return b;
  }));
 }
 function draw(){
  const t=now(),ripe=ripeCount(g,t),next=nextRipe(g,t);
  board.replaceChildren(...g.plots.map((p,i)=>{
   const cell=document.createElement('button');cell.type='button';cell.className='garden-plot';cell.setAttribute('role','gridcell');cell.dataset.index=String(i);
   const s=stage(p,t),c=p&&crop(p.crop);
   cell.dataset.stage=s<0?'empty':s===3?'ripe':'growing';
   const label=document.createElement('span');label.className='garden-label';
   if(!p||!c){const want=crop(seed)!;cell.innerHTML='<span class="garden-soil"></span>';label.innerHTML=g.coins>=want.seed?`<b>Plant</b> ${want.name}`:'<b>Empty</b>';cell.setAttribute('aria-label',`Empty plot. Plant ${want.name} for ${want.seed} coins.`);}
   else if(s===3){cell.innerHTML=cropArt(p.crop,3);label.innerHTML=`<b>${c.name}</b> Harvest +${c.sell}`;cell.setAttribute('aria-label',`${c.name} is ripe. Harvest for ${c.sell} coins.`);}
   else{const at=whenText(ripeAt(p),t);cell.innerHTML=cropArt(p.crop,s);label.innerHTML=`<b>${c.name}</b> ${at}`;cell.setAttribute('aria-label',`${c.name}, ripe ${at}.`);}
   cell.append(label);
   cell.addEventListener('click',()=>act(i));
   return cell;
  }));
  const price=plotPrice(g);
  if(price){const more=document.createElement('button');more.type='button';more.className='garden-plot garden-buy';more.dataset.stage='locked';more.disabled=g.coins<price;more.innerHTML=`<span class="garden-plus">+</span><span class="garden-label"><b>New plot</b> ${price} coins</span>`;more.setAttribute('aria-label',`Buy a new plot for ${price} coins.`);more.addEventListener('click',()=>{if(buyPlot(g)){note='A new plot is ready.';save();draw();}});board.append(more);}
  drawTray();
  const parts=[`${g.coins} coins`];if(ripe)parts.push(`${ripe} ripe`);else if(next)parts.push(`next ripe ${whenText(next,t)}`);
  host.status(note||parts.join(' · '));note='';
  if(g.harvested>host.best.get())host.best.set(g.harvested);
  root.dataset.ripe=String(ripe);
  schedule(next,t);
 }
 function act(i:number){
  const t=now(),p=g.plots[i];
  if(!p){const c=crop(seed)!;if(plant(g,i,seed,t)){note=`${c.name} planted. Ripe ${whenText(t+c.minutes*MINUTE,t)}.`;save();}else note=`${c.name} seeds cost ${c.seed} coins.`;}
  else if(stage(p,t)===3){const c=crop(p.crop)!,value=harvest(g,i,t);note=`${c.name} harvested · +${value} coins.`;save();}
  else return;
  draw();
 }
 // One timer while open: the next minute (countdowns) or the next ripening, whichever is sooner. It stops itself once the panel is gone.
 function schedule(next:number,t:number){
  if(timer)clearTimeout(timer);timer=0;
  const wait=Math.min(MINUTE-(t%MINUTE)+50,next?Math.max(50,next-t):MINUTE);
  timer=setTimeout(()=>{timer=0;if(root.isConnected)draw();},wait);
 }
 function harvestAll(){
  const t=now();let total=0,count=0;g.plots.forEach((_,i)=>{const v=harvest(g,i,t);if(v){total+=v;count++;}});
  note=count?`Harvested ${count} · +${total} coins.`:'Nothing is ripe yet.';if(count)save();draw();
 }
 draw();
 return {element:root,restart:harvestAll,resetLabel:'Harvest all',focusTarget:board,hint:'Pick a seed, plant it, come back when it is ripe.'};
}
