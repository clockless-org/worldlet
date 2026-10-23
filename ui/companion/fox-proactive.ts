import {PROACTIVE,proactiveLate,type ProactiveMoment} from '../../agent/companion/index.ts';
/**
 * Fox speaks first (owner request 2026-10-06). The page notices quiet moments (the person settled
 * into a place and paused, stayed a long time, or is up late) and asks the host whether Fox has one
 * line worth saying; Core's limits decide whether it asks Fox at all, and Fox usually passes. A line
 * that comes back is said in the Fox bar only if the person is still in that place and nothing else
 * is going on; otherwise it is dropped, never queued, because a stale line is noise.
 * In an Applet or page the moment is Browse with me (owner request 2026-10-08): Fox may say one line about what is
 * on screen, asked a few times per visit; the first ask goes out a few seconds after the Applet opens, so Fox opens with
 * a recommendation like a companion beside the person (owner 2026-10-12 「进一个 applet 就开始推荐说话」). There is no switch
 * to turn it off (owner 2026-10-13 「他就该说话就说话」); a short "be quiet" to Fox still holds every line for a while.
 * A line about something waiting on the person carries the open Attention item it is about (`card`, owner 2026-10-10:
 * Attention is the one place to act), and Fox's card offers to open that item's card.
 */
/** How long a line Fox said first stays in its card when nothing replaces it. */
export const PROACTIVE_LINE_MS=30*60_000;
export function mountFoxProactive({call,thread,world,busy,environment,say}:{
 call:(action:string,request:object)=>Promise<any>;
 /** The current place's thread key, or '' where Fox must not speak first (onboarding, desktop companion). */
 thread:()=>string;
 /** The current place is the World itself, not an Applet or page. */
 world:()=>boolean;
 /** The person is talking with Fox, typing, recording, or another line or panel is showing. */
 busy:()=>boolean;
 /** What the place shows (location, state, view), as a turn of the person's own would carry it: in a native Applet
  * there is no page text, and without this Fox saw only the place's name and passed (owner 2026-10-10). */
 environment:()=>object;
 /** `card` is the Attention item the line is about. */
 say:(line:{id:string;text:string;card?:string})=>void;
}){
 let place='',since=Date.now(),activeAt=Date.now(),settled=false,stayed=false,late=false,asking=false,visit='',looks=0,lookedAt=0,openedByPerson=false,game=false,checkedAt=Date.now();
 // The Applet or page the person is in, as it last showed (cached while there, since leaving it changes what the page
 // shows), and the wrap up owed once they are back in the World (owner 2026-10-13: every Applet, not only games).
 let lastSeen:{thread:string;environment:object}|null=null,wrap:{thread:string;minutes:number;environment:object;at:number}|null=null;
 const touched=()=>{activeAt=Date.now();};
 for(const name of ['pointerdown','keydown','wheel'])window.addEventListener(name,touched,{passive:true,capture:true});
 async function ask(moment:ProactiveMoment,key:string,extra:object={}){
  asking=true;
  try{
   let context={};try{context=structuredClone(environment())||{};}catch{}
   const result=await call('foxProactive',{moment,thread:key,minutes:Math.round((Date.now()-since)/60000),environment:context,...extra,...moment==='browsing'?{visit,opened:looks===1&&openedByPerson}:{}});
   // Fox was busy with something else: this visit's look is tried again on a later tick, not lost.
   // A game Worldlet follows (the host says so): Fox keeps playing along this visit (owner 2026-10-13).
   if(result?.game===true&&key===place)game=true;
   if(moment==='browsing'&&result?.reason==='busy'&&key===place)looks--;
  }catch{}
  finally{asking=false;}
 }
 function tick(){
  const key=thread();
  // A place the person just opened themselves (a click or key moments before) gets Fox's opening line; one Fox or the
  // first run brought them to (a task's page, the end of the tour) gets only the later looks.
  if(key!==place){
   // Back in the World after a real stay somewhere (not a game, which has its own reviews): Fox owes a wrap up.
   const stay=(Date.now()-since)/1000;
   wrap=lastSeen&&place&&lastSeen.thread===place&&!game&&stay>=PROACTIVE.wrapup.minStaySeconds&&key&&world()?{thread:place,minutes:Math.round(stay/60),environment:lastSeen.environment,at:Date.now()}:null;
   lastSeen=null;
   place=key;since=Date.now();settled=false;stayed=false;visit=key+'@'+since;looks=0;lookedAt=0;game=false;openedByPerson=since-activeAt<10_000;}
  if(!key||asking||document.hidden||document.fullscreenElement||busy()||/meeting/i.test(key))return;
  const now=Date.now(),here=(now-since)/1000,quiet=(now-activeAt)/1000;
  if(quiet>10*60)return;
  if(!world())try{lastSeen={thread:key,environment:structuredClone(environment())||{}};}catch{}
  // The wrap up goes out as soon as Fox is free, or not at all once it is old news.
  if(wrap){const left=wrap;wrap=null;if(now-left.at<60_000&&world()){void ask('wrapup',key,{left:{thread:left.thread,minutes:left.minutes,environment:left.environment}});return;}}
  // Browsing: an Applet or page looked at for a short while; scrolling and reading count as looking, typing does not
  // reach here (busy). It stands in for the settled moment there: a first look, and one more a few minutes on.
  if(!world()){
   const pace=game?PROACTIVE.browse.game:PROACTIVE.browse;
   const due=looks===0?(openedByPerson?here>=PROACTIVE.browse.settleSeconds:here>=PROACTIVE.browse.againSeconds):looks<pace.perVisit&&(now-lookedAt)/1000>=pace.againSeconds;
   if(due&&quiet>=2){settled=true;looks++;lookedAt=now;void ask('browsing',key);return;}
  }
  // Paused: no input for a little while, but still here (not away from the computer).
  if(quiet<10)return;
  if(!late&&proactiveLate(new Date().getHours())&&here>=PROACTIVE.settleSeconds.world){late=true;void ask('late',key);return;}
  if(!stayed&&here>=PROACTIVE.longStaySeconds){stayed=true;void ask('long-stay',key);return;}
  if(!settled&&here>=(world()?PROACTIVE.settleSeconds.world:PROACTIVE.settleSeconds.applet)){settled=true;checkedAt=now;void ask('settled',key);return;}
  // Check in (owner 2026-10-13 「隔一段时间就表达一下」): every few minutes the person is around, Fox is asked whether it has
  // something to say; the page offers one every 30 seconds and the host lets it through only once Fox has been quiet that long.
  if((now-checkedAt)/1000>=30){checkedAt=now;void ask('checkin',key);}
 }
 // A short tick, so the opening line is asked a few seconds after an Applet opens rather than on the next 10 s beat.
 const timer=setInterval(tick,2000);
 window.addEventListener('worldlet:fox-proactive',(event:any)=>{
  const {id,line,thread:key,moment,card}=event.detail||{};
  if(typeof id!=='string'||typeof line!=='string')return;
  const shown=!!line.trim()&&key===thread()&&!busy();
  if(shown)say({id,text:line.trim(),...typeof card==='string'&&card?{card}:{}});
  void call('foxProactiveShown',{id,shown}).catch(()=>{});
 });
 return {stop:()=>clearInterval(timer)};
}

/** How a line Fox said on its own arrives in its card (owner 2026-10-12 「主动说的话给对话框一个效果」): a warm glow
 * rings the card and a light sweeps across it while the words write in from the left; the ring then stays faintly
 * while the line shows (fox-proactive.css, `data-proactive`). Replies keep their plain entrance. */
export function arriveProactive(card:HTMLElement,text:HTMLElement,reduced:boolean){
 let glow=card.querySelector(':scope>.companion-proactive-glow') as HTMLElement|null;
 if(!glow){
  glow=Object.assign(document.createElement('i'),{className:'companion-proactive-glow'});glow.setAttribute('aria-hidden','true');
  glow.append(Object.assign(document.createElement('i'),{className:'companion-proactive-shine'}));
  card.append(glow);
 }
 for(const motion of [...glow.getAnimations({subtree:true}),...text.getAnimations()])motion.cancel();
 if(reduced){glow.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});return;}
 glow.animate([{opacity:0,backgroundColor:'#ffd88a00',boxShadow:'0 0 0 0 #eea24b00, 0 0 0 0 #ffbd5c00'},{opacity:1,backgroundColor:'#ffd88a38',boxShadow:'0 0 0 3px #eea24bee, 0 0 40px 10px #ffbd5ccc',offset:.3},{opacity:1,backgroundColor:'#ffd88a00',boxShadow:'0 0 0 1.5px #eea24bb3, 0 0 20px 3px #ffbd5c66'}],{duration:1600,easing:'cubic-bezier(.2,.7,.3,1)'});
 (glow.firstElementChild as HTMLElement).animate([{transform:'translateX(-120%) skewX(-18deg)',opacity:0},{opacity:1,offset:.2},{transform:'translateX(260%) skewX(-18deg)',opacity:0}],{duration:1100,delay:120,easing:'cubic-bezier(.3,.1,.3,1)'});
 text.animate([{clipPath:'inset(0 100% 0 0)',opacity:.3,filter:'blur(3px)'},{clipPath:'inset(0 0 0 0)',opacity:1,filter:'blur(0)'}],{duration:900,easing:'cubic-bezier(.25,.8,.3,1)'});
}
