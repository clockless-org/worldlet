import type {JointControl} from './fox-anatomy.ts';
import {workingStowLayout,WORKING_STOW_DURATION} from './fox-working-stow-study.ts';
import baked from '../../../resources/styles/builtin/drafts/fox-states-v1/working-stow-path.json' with {type:'json'};

/** Six precomputed rotation channels; no iterative IK solve in playback.
 * Uniform cubic B-spline gives continuous position/velocity/acceleration.
 * Odd endpoint extension preserves the exact neutral hands at both ends.
 * The analytic device/body path stays shared with the authoring reference. */
export function workingStowPath(milliseconds:number,reduced=false){
 const {armWeight:_,...frame}=workingStowLayout(milliseconds,reduced);
 const t=reduced?WORKING_STOW_DURATION:Math.min(milliseconds,WORKING_STOW_DURATION),q=t/baked.stepMs,index=Math.floor(q),u=q-index;
 const weights=[(1-u)**3,3*u**3-6*u*u+4,-3*u**3+3*u*u+3*u+1,u**3].map(v=>v/6);
 const end=baked.samples.length-1;
 const value=(i:number,c:number):number=>i<0?2*baked.samples[0][c]-baked.samples[-i][c]:i>end?2*baked.samples[end][c]-baked.samples[2*end-i][c]:baked.samples[i][c];
 const pose:Record<string,JointControl>={...frame.pose};
 baked.channels.forEach((id,c)=>pose[id]={angle:weights.reduce((sum,w,j)=>sum+w*value(index+j-1,c),0)});
 return {...frame,pose};
}
