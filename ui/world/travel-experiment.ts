import {node,facts,notice,actionButton} from '../components/index.ts';
import {travelState} from './travel-state.ts';
// Fictional, device-local plan choices. The world displays; the companion dock acts.
export const STAY_OPTIONS=[
 {id:'garden',title:'Garden House',price:'$180 / night',area:'Quiet courtyard · 18 min to station',terms:'Free cancellation until 3 days before',color:'moss'},
 {id:'station',title:'Station House',price:'$140 / night',area:'Steps from trains · Busier streets',terms:'Free cancellation until 1 day before',color:'blue'}
];
export function mountTravelExperiment({root,room,pages,visit,refresh,open,state,onContext,storage}){
 if(!room?.trip)return null;
 const source=pages.get(room.trip.stay);if(!source||source.localArchive||source.modifiedLocally)return null;
 const original={sceneFacts:structuredClone(source.sceneFacts),markdown:source.markdown,text:source.text};
 let savedChoice=null;try{savedChoice=storage?.getItem('kyoto-stay');}catch{}
 const model={comparing:false,selected:null,chosen:null,preference:''};room.stayExperiment=model;
 const visible=()=>state().depth==='object'&&['object-japan','module-trip','matter-japan'].includes(state().id);
 const replies={compare:'Compare two stays',itinerary:'Show my itinerary',garden:'Show me the quieter one',station:'Show me the one near trains',confirm:'Add this stay to my plan',other:'Show me the other place',both:'Compare both again',details:'Show the details',again:'Let’s compare again',undo:'Undo my selection'};
 const button=(id,label,run)=>({id:'trip:'+id,label,replyLabel:replies[id],run,resultHint:['garden','station','other'].includes(id)?'Candidate preview only; not saved. Continue with the current confirmation action if the user asked to add this stay.':id==='confirm'?'Stay choice saved in the local sample plan. No booking or payment occurred.':undefined,kind:'trip',placement:id==='enter'?'navigation':'contextual',icon:/details|itinerary/.test(id)?'file':'map'});
 function enter(){visit('object-japan');sync();}
 function compare(preference=''){model.comparing=true;model.selected=null;model.preference=preference;enter();refresh();sync();showComparison();}
 function choose(id){if(!STAY_OPTIONS.some(o=>o.id===id))return;model.selected=id;model.comparing=true;refresh();sync();const pane=root.querySelector('#notionDialog');if(pane.open&&pane.dataset.template==='stay-comparison')showComparison();}
 function confirm(){const choice=STAY_OPTIONS.find(o=>o.id===model.selected);if(!choice)return;
  storage?.setItem('kyoto-stay',choice.id);model.chosen=choice.id;model.comparing=false;model.selected=null;
  applyChoice();
  refresh();sync();
  const dialog=root.querySelector('#notionDialog');if(dialog.open&&dialog.dataset.template==='stay-comparison')showComparison();
 }
 function applyChoice(){const choice=STAY_OPTIONS.find(o=>o.id===model.chosen),target=pages.get(source.id);if(!choice||!target||target.modifiedLocally)return;
  target.sceneFacts={...original.sceneFacts,status:'Kyoto · '+choice.title+' selected',next:'Next: review Osaka stay',needsAction:false};
  target.markdown='## Kyoto stay · Fictional sample\n\nSelected: '+choice.title+'\n\n'+choice.price+' · 2 nights\n\n'+choice.area+'\n\n'+choice.terms+'\n\nSelected for this plan only. No reservation, payment, or external message was made.\n\nTokyo is confirmed in the sample; Osaka still needs a stay.';target.text=target.markdown;
 }
 function itinerary(){const body=open(room.title);const status=travelState(room,pages);body.append(facts([['Route',status.route],['Departure',status.countdown],['Dates',status.dates],['Kyoto',model.chosen?STAY_OPTIONS.find(o=>o.id===model.chosen).title+' · Selected, not booked':'Stay needed']]),notice(model.chosen?'Next: review Osaka accommodation. Kyoto is selected for your plan; you still need to book it.':'Next: choose your Kyoto stay.'));
  body.append(actionButton({label:'Compare Kyoto stays',icon:'map',run:()=>compare()}));
 }
 function showComparison(){
  const body=open('Kyoto stays');root.querySelector('#notionDialog').dataset.template='stay-comparison';const status=travelState(room,pages);
  const route=node('div','ui-trip-route');route.append(node('span','','Tokyo'),node('span','','→'),node('strong','','Kyoto · 2 nights'),node('span','','→ Osaka'));body.append(route);
  const progress=node('div','ui-trip-status');for(const text of [status.countdown,'Flights confirmed',model.chosen?'Kyoto selected':'Kyoto stay needed']){const tag=node('span','',text);tag.dataset.pending=String(text==='Kyoto stay needed');progress.append(tag);}body.append(progress);
  body.append(node('p','ui-caption','Compare the two places on your map. Prices and properties are fictional.'));
  const grid=node('div','ui-choice-grid');body.append(grid);
  for(const [i,choice] of STAY_OPTIONS.entries()){
   const selected=(model.selected||model.chosen)===choice.id,card=actionButton({label:'',run:()=>choose(choice.id)});card.classList.add('ui-stay-preview');card.dataset.stay=choice.id;card.setAttribute('aria-pressed',String(selected));card.setAttribute('aria-label','Preview '+choice.title);
   card.replaceChildren(node('span','ui-stay-letter',i?'B':'A'),node('strong','',choice.title),node('span','',choice.price),node('small','',choice.area),node('small','',choice.terms));grid.append(card);
  }
  const footer=node('div','ui-trip-confirm');body.append(footer);
  const choice=STAY_OPTIONS.find(o=>o.id===(model.selected||model.chosen));
  if(choice){const already=model.chosen===choice.id;footer.append(node('p','',already?choice.title+' is in your plan.':choice.title+' · '+(choice.id==='garden'?'$360':'$280')+' for 2 nights'),actionButton({label:already?'Selected for this plan':'Choose '+choice.title,variant:'primary',disabled:already,run:confirm}),node('small','ui-caption','No reservation or payment is made.'));
   if(already)footer.append(actionButton({label:'Review itinerary',icon:'calendar',run:itinerary}));
  }else footer.append(node('p','ui-caption','Select A or B to preview it, then confirm your choice.'));
 }
 function details(){const choice=STAY_OPTIONS.find(o=>o.id===(model.selected||model.chosen));if(!choice)return;const body=open(choice.title);for(const text of [choice.price+' · 2 nights',choice.area,choice.terms,'Illustrative property, prices and terms. No real hotel or reservation.']){const p=document.createElement('p');p.textContent=text;body.append(p);}}
 function context(){
  if(state().depth==='overview')return {extra:[button('enter',model.chosen?room.title:room.title+' · Choose a stay',enter)]};
  if(!visible())return null;
  const selected=STAY_OPTIONS.find(o=>o.id===model.selected),chosen=STAY_OPTIONS.find(o=>o.id===model.chosen),countdown=travelState(room,pages).countdown;
  let phase='plan',title=room.title,detail=countdown+'. Kyoto still needs a stay. Shall we compare two places?',actions=[button('compare','Compare stays',()=>compare()),button('itinerary','Trip details',itinerary)];
  if(model.comparing&&selected){phase=selected.id;title=room.title+' / '+selected.title;detail=selected.price+'. '+selected.area+'. '+selected.terms+'.';actions=[button('confirm','Choose this stay',confirm),button('other',selected.id==='garden'?'See Station House':'See Garden House',()=>choose(selected.id==='garden'?'station':'garden')),button('both','Compare both',()=>compare()),button('details','Details',details)];}
  else if(model.comparing){phase='compare';title=room.title+' / Kyoto stays';detail=/cheap|budget|cost|便宜/i.test(model.preference)?'Station House costs less. Garden House gives you a quieter courtyard. Which fits your trip?':'Garden House has a quiet courtyard. Station House costs less and is near the trains. Which would you like to see?' ;actions=STAY_OPTIONS.map(o=>button(o.id,o.title+' · '+o.price,()=>choose(o.id)));}
  else if(chosen){phase='chosen:'+chosen.id;title=room.title+' / Stay selected';detail=chosen.title+' is in your Kyoto plan. Not booked. You can change your mind or keep exploring.';actions=[button('itinerary','Review itinerary',itinerary),button('again','Change stay',()=>compare())];}
  const agentActions=[...actions];
  const inspect=root.querySelector('#notionDialog');if(inspect.open&&inspect.dataset.template==='stay-comparison')actions=[];
  return {context:{key:'trip:'+phase,title:room.title,detail},actions,agentActions};
 }
 function sync(){applyChoice();root.classList.toggle('travel-experiment-active',visible());root.dataset.travelPhase=model.comparing?'compare':model.chosen?'selected':'intro';root.dataset.travelSelection=model.selected||model.chosen||'';onContext?.();}
 function action(id){if(id==='compare')compare();else if(id==='chosen'){model.comparing=false;sync();}else choose(id);}
 if(STAY_OPTIONS.some(o=>o.id===savedChoice)){model.selected=savedChoice;confirm();}
 sync();return {action,sync,context,tasks:()=>model.chosen?[{...button('review',room.title+' · Review Osaka stay',()=>{enter();itinerary();}),state:'needsAction',taskTitle:room.title,objective:'Review Osaka stay',icon:'map',placeId:room.id}]:[{...button('enter',room.title+' · Choose a stay',enter),state:'needsAction',taskTitle:room.title,objective:'Choose a stay in Kyoto',icon:'map',placeId:room.id}]};
}
