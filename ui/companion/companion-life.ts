import {isFoxForegroundActivity} from '../../contracts/companion-activity.ts';
import type {FoxActivitySignal} from '../../contracts/companion-activity.ts';
import {anatomyRuntimeState,anatomyRuntimeDuration} from './animation/fox-anatomy-runtime.ts';
import {riveFoxState} from './animation/fox-rive.ts';
import {FOX_STATES,foxState} from './animation/fox-state-catalog.ts';
import {FOX_ACTIONS} from './fox-actions.ts';
const authoredState=(state:string)=>anatomyRuntimeState(state)??riveFoxState(state);
const authoredPreview=Object.freeze(FOX_STATES.filter(s=>authoredState(s.id)===s.id).map(s=>s.id));
/** This build's Fox performs every catalog state (the Rive Fox, or the draft anatomy rig). */
export const authoredFox=()=>{const assets=(globalThis as any).__WORLDLET_ENV_ASSETS__;return Boolean(assets?.companionRive||assets?.companionAnatomy);};
/** Preview availability is not production acceptance. Never alias unfinished
 * catalog entries to a generic performance just to fill the preview count. */
export function companionPreviewActions(anatomical=false):readonly string[]{return anatomical?authoredPreview:FOX_ACTIONS;}
export function activityPose(state:string,_text='',signal?:FoxActivitySignal){
 if(!['working','thinking'].includes(state))return state;
 return signal&&['tool','stage'].includes(signal.source)&&isFoxForegroundActivity(signal.activity)?signal.activity:state;
}

// Explicit compatibility until the complete artwork is accepted. Keep semantic
// identity separately; falling back is NOT evidence that a state is implemented.
export function activityPresentation(activity:string,anatomical=false){
 if(anatomical&&authoredState(activity))return activity;
 if(['reading','drafting','searching','thinking','working'].includes(activity))return activity;
 if(['comparing','planning','calculating','organizing','creating','checking'].includes(activity))return 'working';
 if(['awaiting_user','awaiting_service'].includes(activity))return 'listening';
 return activity;
}

// Internal activity changes the pose, never creates a message.
export function mountCompanionLife(_root:HTMLElement,_pet:HTMLElement,avatar:HTMLElement){
 return {
  finish(success:boolean,{blocked=false}={}){avatar.dataset.requestedPose=success?'happy':blocked&&authoredFox()?'blocked':'idle';},
  update(value:{state:string;text?:string;context?:string;signal?:FoxActivitySignal}){const activity=activityPose(value.state,value.text,value.signal);avatar.dataset.semanticState=activity;avatar.dataset.activity=activityPresentation(activity,authoredFox());}
 };
}

// Brief authored gestures, even when the desktop pet is not focused.
// No pretend reading or invented background jobs.
export function ambientPose(elapsed:number,anatomical=false){
 // Leave long uninterrupted idle windows for breathing and weight transfer.
 // The legacy two-second slot cuts the authored 11.2-second look mid-gesture.
 if(anatomical){const phase=Math.max(0,elapsed)%90000;return phase>=45000&&phase<45000+anatomyRuntimeDuration('looking')!?'looking':null;}
 const phase=Math.max(0,elapsed)%11000;
 if(phase<7500||phase>=9500)return null;
 return 'looking';
}
export function companionPreviewDuration(state:string,anatomical=false){
 if(!anatomical)return 6000;
 const duration=state==='idle'?18000:anatomyRuntimeDuration(state)??(foxState(state)?.seconds??0)*1000;
 return Math.max(6000,duration+650);
}
