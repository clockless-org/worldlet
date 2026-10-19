/** Software graphics after a crashing GPU process (agent/app/ANALYTICS.md#graphics-fallback). A computer whose
 * graphics driver keeps ending Chromium's GPU process crashes the World page with it, and Chromium ends the whole app
 * once the GPU process is not usable: one Windows computer restarted into that every twenty seconds (Build 4384,
 * 2026-10-14). The second GPU process crash within five minutes, in one run or across restarts, switches this
 * installation to software graphics (SwiftShader, which keeps WebGL) for a week; then the hardware is tried again. */
export const GPU_CRASH_LIMIT=2;
export const GPU_CRASH_WINDOW_MS=5*60_000;
export const SOFTWARE_GRAPHICS_MS=7*86_400_000;
export type GraphicsMode='hardware'|'software';
export interface GraphicsState {mode?:'software';since?:number;crashes?:number[]}

const times=(value:unknown)=>Array.isArray(value)?value.filter((at):at is number=>typeof at==='number'&&Number.isFinite(at)):[];

/** The graphics this launch starts with. A software period that has run out, or one stamped in the future, is over. */
export function graphicsMode(state:GraphicsState|null|undefined,now:number):GraphicsMode {
 const since=Number(state?.since);
 return state?.mode==='software'&&Number.isFinite(since)&&since<=now&&now-since<SOFTWARE_GRAPHICS_MS?'software':'hardware';
}

/** A GPU process crash at `now` while running `mode`: the state to keep, and whether to restart into software
 * graphics now. Software graphics never falls back further; its crashes are only counted. */
export function afterGpuCrash(state:GraphicsState|null|undefined,now:number,mode:GraphicsMode):{state:GraphicsState,fallback:boolean} {
 const crashes=[...times(state?.crashes).filter(at=>at<=now&&now-at<GPU_CRASH_WINDOW_MS),now].slice(-10);
 if(mode==='hardware'&&crashes.length>=GPU_CRASH_LIMIT)return {state:{mode:'software',since:now,crashes:[]},fallback:true};
 return {state:graphicsMode(state,now)==='software'?{mode:'software',since:state!.since,crashes}:{crashes},fallback:false};
}

/** Windows NTSTATUS codes worth naming for a child process that ended (`app_process_gone` exit_code). */
const EXIT_CODES:Record<string,string>={c0000005:'access_violation',c0000409:'stack_buffer_overrun',c0000135:'dll_not_found',c0000142:'dll_init_failed',
 c0000428:'invalid_image_hash',c0000374:'heap_corruption',c000001d:'illegal_instruction',c00000fd:'stack_overflow',c0000022:'access_denied',
 c0000017:'no_memory',c0000602:'fail_fast',c0000420:'assertion_failure','80000003':'breakpoint',e0000008:'out_of_memory'};
export const EXIT_CODE_NAMES=[...new Set(Object.values(EXIT_CODES)),...Array.from({length:9},(_,i)=>`exit_${i+1}`),'other'];
/** An exit code as a fixed name: a known Windows status, a small exit code, else `other`. Never the raw number. */
export function exitCodeName(code:unknown):string {
 if(typeof code!=='number'||!Number.isSafeInteger(code)||code===0)return '';
 if(code>=1&&code<=9)return `exit_${code}`;
 return EXIT_CODES[(code>>>0).toString(16).padStart(8,'0')]??'other';
}
