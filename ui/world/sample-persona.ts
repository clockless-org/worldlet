import type {World,WorldPage} from '../../contracts/world.ts';
import dataset from './sample-persona.json' with {type:'json'};
import {projectWorldItems} from '../../core/items/index.ts';

export const SAMPLE_DATASET_ID=dataset.id;
// The trip diorama binds to four pages by id; the ids live with the data.
export const SAMPLE_TRIP={route:dataset.trip.route,calendar:dataset.trip.calendar,flight:dataset.trip.flight,stay:dataset.trip.stay};

const PROVIDER_NAMES={gmail:'Gmail','google-calendar':'Calendar','apple-notes':'Notes','apple-reminders':'Reminders',weather:'Weather',github:'GitHub',codex:'Codex','claude-code':'Claude Code',notion:'Notion',obsidian:'Obsidian',messages:'Messages',plaid:'Plaid',stripe:'Stripe',paypal:'PayPal',oura:'Oura',strava:'Strava',fitbit:'Fitbit','google-maps':'Google Maps',airbnb:'Airbnb',tripit:'TripIt',x:'X',youtube:'YouTube',tiktok:'TikTok',discord:'Discord',browser:'Browser',doordash:'DoorDash'};
export const sampleProviderName=key=>PROVIDER_NAMES[key]||key;

// Every date in the sample is an offset from today, so the week never goes stale:
// the flight is always twelve days out and the pilot review always six.
export function sampleDates(now=new Date()){
 const dates=Object.fromEntries(Object.entries(dataset.dates).map(([key,n])=>[key,new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+n)).toISOString().slice(0,10)]));
 const saturday=new Date(now);let days=(6-now.getDay()+7)%7;if(days===0&&now.getHours()>=10)days=7;saturday.setDate(now.getDate()+days);
 dates.tennisSaturday=[saturday.getFullYear(),String(saturday.getMonth()+1).padStart(2,'0'),String(saturday.getDate()).padStart(2,'0')].join('-');
 return dates;
}
function resolver(now){
 const dates=sampleDates(now);
 // {{key}} is the date; {{day:key}} is the name of its weekday, so a meeting that is
 // always three days out is always "before Monday" on a Friday, never "before Thursday".
 const text=value=>String(value).replace(/\{\{(day:)?(\w+)\}\}/g,(_,day,key)=>{
  if(!(key in dates))throw Error('Unknown sample date: '+key);
  return day?new Date(dates[key]+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}):dates[key];
 });
 const deep=value=>typeof value==='string'?text(value):Array.isArray(value)?value.map(deep):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,deep(v)])):value;
 return {text,deep,dates};
}

// The attention items, in the contract every Applet publishes through. They are
// projected into the world by the same code a real world uses, so the Attention
// Center, the stages and Fox all see exactly what they would see for a person.
export function sampleItems(now=new Date(),status={}){
 const {text}=resolver(now);
 return dataset.items.flatMap((item,i)=>{
  // Keep source records rich, but the opening attention panel deliberately quiet.
  if(!dataset.attentionItems.includes(i+1))return [];
  const id='sample-item-'+(i+1);
  return {id,provider:item.provider,kind:item.kind,status:status[id]||'open',title:text(item.title),context:text(item.context),reason:text(item.context),summary:text(item.summary),actionLabel:text(item.actionLabel||''),
   priority:i===23?'high':item.priority||'normal',...(item.start?{start:i===5?new Date(now.getTime()+30*60000).toISOString():text(item.start)}:{}),...(item.end?{end:i===5?new Date(now.getTime()+90*60000).toISOString():text(item.end)}:{}),...(item.allDay?{allDay:true}:{}),
   noteId:item.noteId,sources:[{provider:item.provider,id:item.noteId,quote:text(item.quote)},...(item.evidence||[]).map(e=>({...e,quote:text(e.quote)}))],createdAt:1,updatedAt:1};
 });
}

// The shared Mac/Web seed is authored fiction. Never hydrate it from private imports.
export function enrichSampleWorld(world: World,{now=new Date(),itemStatus={}}: {now?: Date;itemStatus?: Record<string,string>}={}){
 const {text,deep}=resolver(now);
 const originals=new Map(world.pages.map(p=>[p.id,p]));
 const rooms=new Map(world.spaces.map(r=>[r.id,r]));
 for(const room of rooms.values())room.children=[];
 const notes=dataset.notes.map(note=>{
  const room=rooms.get('place-'+note.room);if(!room)throw Error('Unknown sample room: '+note.room);
  const provider=sampleProviderName(note.applet);
  const page: WorldPage={...originals.get(note.id),id:note.id,title:text(note.title),kind:'page',parent:'sample-root',children:[],path:note.id+'.md',paths:[note.id+'.md'],markdown:text(note.markdown),objectKind:note.kind,spatialStatus:text(note.status),matter:note.matter,applet:note.applet,provenance:[{provider,label:'Fictional '+provider+' record · '+dataset.name}]};
  if(dataset.trip.facts[note.id])page.sceneFacts=deep(dataset.trip.facts[note.id]);
  page.text=page.title+'\n'+page.markdown;room.children.push(page.id);return page;
 });
 // Replace the entire seed, so retired fixtures cannot linger in search or model context.
 world.pages=[{...originals.get('sample-root'),children:notes.map(p=>p.id)},...notes];
 world.persona=structuredClone(dataset.persona);world.sampleDataset=dataset.id;world.profilePageId=dataset.profilePageId;
 world.sampleMatters=dataset.matters.map(m=>({...m}));
 world.coverage={...world.coverage,pages:notes.length,scope:notes.length+' original fictional English records for '+dataset.name+'. No private sources.'};
 for(const room of rooms.values()){
  const key=room.id.slice(6);
  if(dataset.summaries[key])room.summary=text(dataset.summaries[key]);
  if(!room.children.includes(room.example)&&room.example!=='object-japan')room.example=room.children[0];
 }
 world.sampleTour=[...dataset.tour];
 world.sampleDecisions=structuredClone(dataset.decisions);
 projectWorldItems(world,sampleItems(now,itemStatus));
 return world;
}
