/**
 * Fox's steps on a website page, shown as the page's one status (#1619, owner feedback 2026-10-02):
 * a small card hanging from the page's top edge says the step Fox is on, lists the steps before it,
 * each ticked once Fox moves on, and when Fox's turn ends shows its result in the same place. The
 * steps are the plain words Fox already says for each browser action ("Filling in the form") and the
 * steps it says in words (`automate_browser` `do`, "Click Add to cart"). "Thinking" is what Fox does
 * between steps, so it heads the card without becoming a step.
 */
export interface FoxStep {text:string;done:boolean}
export interface FoxSteps {steps:FoxStep[];now:string;result:string;finished:boolean;ok:boolean}
/** What the card shows: the latest steps, how many earlier ones scrolled away, and the result. */
export interface FoxStepsView {steps:FoxStep[];earlier:number;result:string;finished:boolean;ok:boolean}

export const FOX_STEPS_SHOWN=5;
const STEP_CHARS=72,RESULT_CHARS=180;
const THINKING=/^thinking\b/i;

const clean=(text:unknown)=>String(text??'').replace(/\s+/g,' ').trim().replace(/(?:…|\.\.\.)$/,'').trim();

export function foxStepsStart():FoxSteps {return {steps:[],now:'',result:'',finished:false,ok:true};}

/** Fox began a step, or began thinking: the step before it is done. */
export function foxStepsAdd(state:FoxSteps,text:unknown):FoxSteps {
 const step=clean(text).slice(0,STEP_CHARS);if(!step)return state;
 const steps=state.steps.map(s=>s.done?s:{...s,done:true});
 const last=state.steps.at(-1);
 if(THINKING.test(step))return {...state,steps,now:step,finished:false};
 // The same words again (a second click, the first `do` step after the tool said it) is the same step.
 if(last&&!last.done&&last.text===step)return {...state,now:step,finished:false};
 return {...state,steps:[...steps,{text:step,done:false}],now:step,finished:false};
}

/** Fox's turn ended: with a reply every step is done and the reply is the result; a turn that
 * failed or stopped leaves the step it was on unticked. */
export function foxStepsFinish(state:FoxSteps,{ok,result}:{ok:boolean;result?:unknown}):FoxSteps {
 const steps=ok?state.steps.map(s=>s.done?s:{...s,done:true}):state.steps;
 return {...state,steps,now:'',finished:true,ok,result:foxResultText(result)};
}

/** The first lines of Fox's reply as plain text: no Markdown marks, links kept as their words. */
export function foxResultText(text:unknown):string {
 const plain=String(text??'')
  .replace(/!\[[^\]]*\]\([^)]*\)/g,'')
  .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
  .replace(/`([^`]*)`/g,'$1')
  .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]*?\S)\1/g,'$2')
  .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/gm,'')
  .replace(/\s+/g,' ').trim();
 if(plain.length<=RESULT_CHARS)return plain;
 const cut=plain.slice(0,RESULT_CHARS),end=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('。'),cut.lastIndexOf('! '),cut.lastIndexOf('? '));
 return end>=RESULT_CHARS/2?cut.slice(0,end+1):cut.replace(/\s+\S*$/,'')+'…';
}

export function foxStepsView(state:FoxSteps):FoxStepsView {
 const earlier=Math.max(0,state.steps.length-FOX_STEPS_SHOWN);
 return {steps:state.steps.slice(earlier),earlier,result:state.result,finished:state.finished,ok:state.ok};
}

/** Whether there is anything worth a card after the turn: a step Fox took or a result. */
export const foxStepsWorthShowing=(state:FoxSteps)=>state.steps.length>0;
