import {loginItemOfferDue,loginItemOn,loginItemText} from '../../core/distribution/index.ts';

/** Worldlet turns on Open at Login once (#1229) and Fox says so, with a way to turn it off: after
 * onboarding and its celebrations, never during setup, the tour or the first task. It does not ask
 * first (owner request 2026-10-07: do it for the person instead of asking). Done once, it is final;
 * afterwards only the `login` guide or the app menu changes it. The system shows nothing beyond what
 * it shows by itself. */
const FIRST_WIN_DELAY=10000,LATER_LAUNCH_DELAY=3000;
export function mountLoginItemOffer({root,view,call,state:initial}){
 let state=initial,destroyed=false,asked=false,checking=false,notBefore=Date.now()+LATER_LAUNCH_DELAY;
 const button=(label,run)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await run();}catch(e){view.setGuide({source:'login-item',text:e.message,actions:[],takeover:false});}};return b;};
 // Only an idle overview: nothing Fox is saying or doing, no place or preview open.
 const idle=()=>!view.busy&&root.dataset.replyBusy!=='true'&&root.dataset.attentionPreview!=='true'&&(!view.current||view.current==='overview')&&['','first-value'].includes(view.guideSource);
 const turnOn=async()=>{
  await call('loginItem',{operation:'offered'});
  const login=await call('loginItem',{operation:'set',enabled:true});
  // Fox repeats what the system reports, including when macOS still wants approval.
  const on=loginItemOn(login.status),off=button('Don\'t open at login',async()=>{await call('loginItem',{operation:'set',enabled:false});view.setGuide(null);});
  view.setGuide({source:'login-item',takeover:false,text:login.status==='enabled'?'**Worldlet now opens quietly when you log in.**':loginItemText(login.status,login.platform),actions:on?[off]:[]});
  view.revealGuide?.();
 };
 async function tick(){
  if(destroyed||asked||checking||Date.now()<notBefore||!idle())return;
  if(!loginItemOfferDue({status:'disabled',offered:false,onboarding:state.onboarding}))return;
  checking=true;
  try{
   // The system and the remembered answer decide, not the snapshot the page last saw.
   const login=await call('loginItem');
   if(destroyed||!loginItemOfferDue({status:login.status,offered:login.offered,onboarding:state.onboarding})){asked=true;return;}
   if(!idle())return;
   asked=true;
   await turnOn();
  }catch{asked=true;}finally{checking=false;}
 }
 // The first win keeps its moment: the fireworks and Fox's line come first.
 const won=()=>{notBefore=Date.now()+FIRST_WIN_DELAY;};
 root.addEventListener('worldlet:first-win',won);
 const timer=setInterval(()=>void tick(),1500);
 return {
  // Finishing the journey in this run is the first win, whichever arrives first: event or snapshot.
  update(next){const was=loginItemOfferDue({status:'disabled',offered:false,onboarding:state.onboarding});state=next;if(!was&&loginItemOfferDue({status:'disabled',offered:false,onboarding:state.onboarding}))won();},
  destroy(){destroyed=true;clearInterval(timer);root.removeEventListener('worldlet:first-win',won);},
 };
}
