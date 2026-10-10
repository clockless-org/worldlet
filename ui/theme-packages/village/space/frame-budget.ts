/**
 * How often the World and Fox redraw. Nothing in the World is ever fully still (water, smoke, sky,
 * Fox breathing), but a settled scene does not need the display's full cadence: drawing every frame
 * kept the World's renderer and GPU processes busy while nobody used it (Activity Monitor showed the
 * helper processes at 25–70 % CPU with the World idle).
 *
 * - `moving`: camera moves, reveals, hover glows, dragging and input from the last `wakeMs`.
 * - `settled`: the window is in front and nothing is moving; ambient motion stays smooth.
 * - `inactive`: another app is in front; the World is a backdrop.
 * - `still`: reduced motion or motion turned off and nothing moving; only state changes draw.
 *
 * Rates are caps on top of requestAnimationFrame, which keeps running, so pages that wait on
 * animation frames are unaffected.
 */
export const WORLD_FRAME_RATE=Object.freeze({moving:60,settled:30,inactive:15,still:5,wakeMs:1500});
export const FOX_FRAME_RATE=Object.freeze({moving:60,settled:30,inactive:20});

export function worldFrameRate({moving,windowActive,animated}:{moving:boolean;windowActive:boolean;animated:boolean}):number {
 const rate=WORLD_FRAME_RATE;
 if(moving)return rate.moving;
 if(!animated)return rate.still;
 return windowActive?rate.settled:rate.inactive;
}

export function foxFrameRate({moving,windowActive}:{moving:boolean;windowActive:boolean}):number {
 const rate=FOX_FRAME_RATE;
 return moving?rate.moving:windowActive?rate.settled:rate.inactive;
}

/** Whether a frame due at `now` should draw, given the last drawn frame and a rate; a frame arriving
 * up to 2 ms early still draws so display-aligned callbacks do not drop to half the rate. */
export function frameDue(now:number,last:number,fps:number):boolean {
 return !(last>0)||now-last>=1000/fps-2;
}

/** Whether a new environment changes the scene enough to draw it at the full rate for a moment: a
 * lighting preview or a weather change does; the clock re-sending the same sky every 15 seconds
 * (ui/shell/world-environment.ts) does not, and used to wake an idle World each time. */
export function environmentShifted(before:any,after:any):boolean {
 const near=(key:string,by:number)=>{const a=before?.[key],b=after?.[key];return a===b||Math.abs(a-b)<=by;};
 return before?.kind!==after?.kind||before?.night!==after?.night||!near('daylight',.01)||!near('progress',.01)||!near('cloud',.01)||!near('wind',1)||!near('windFrom',5);
}

// The desktop host reports its window becoming active or inactive (platform/electron/src/main.ts);
// the website and fixtures have only the page's own focus.
let active=typeof document==='undefined'||document.hasFocus?.()!==false;
if(typeof window!=='undefined'){
 for(const name of ['worldlet:app-active','focus'])window.addEventListener(name,()=>{active=true;});
 for(const name of ['worldlet:app-inactive','blur'])window.addEventListener(name,()=>{active=false;});
}
/** The World's window is the frontmost one, as last reported by the host. */
export function windowActive():boolean {return active;}
