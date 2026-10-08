import fs from 'node:fs';
import {app,BrowserWindow,powerSaveBlocker,type NativeImage,type WebContents} from 'electron';
/** Development check: wait for the World, then save a frame and a page probe and quit.
 * WORLDLET_CAPTURE=<png> [WORLDLET_CAPTURE_PROBE=<js expression>] [WORLDLET_CAPTURE_WAIT=<ms>].
 * Every stage is bounded, so a stalled probe or frame becomes a reported error, never a silent hang (#1045). */
const within=<T>(work:Promise<T>,ms:number)=>Promise.race([work,new Promise<'stalled'>(resolve=>setTimeout(()=>resolve('stalled'),ms))]);
export function installCapture(contents:WebContents){
 const file=process.env.WORLDLET_CAPTURE;
 if(!file)return;
 // A covered or minimized window on a shared desktop must keep producing frames for the probe and capture.
 contents.setBackgroundThrottling(false);
 // The display must stay on while this check runs: 01's display was found off during RC smoke runs
 // (2026-10-01, #1060). The block ends when the app exits.
 powerSaveBlocker.start('prevent-display-sleep');
 // A GPU process that exits during the run is reported, so a black or uncapturable window shows
 // whether the GPU process died (#1060).
 const gpuExits:string[]=[];
 app.on('child-process-gone',(_event,details)=>{if(details.type==='GPU')gpuExits.push(`${details.reason} (exit ${details.exitCode})`);});
 const errors:string[]=[];
 contents.on('console-message',details=>{if(details.level==='error'||details.level==='warning')errors.push(`[${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);});
 // Any other failure still writes a report and exits, so the caller never waits for its own timeout.
 contents.once('did-finish-load',()=>void (async()=>{
  const wait=Number(process.env.WORLDLET_CAPTURE_WAIT||'12000');
  const ready=contents.executeJavaScript(`new Promise(r=>{if(!document.getElementById('worldStartup'))return r('ready');document.addEventListener('worldlet:world-revealed',()=>r('revealed'),{once:true});document.addEventListener('worldlet:world-error',()=>r('error'),{once:true});})`,true);
  const outcome=await Promise.race([ready,new Promise(r=>setTimeout(()=>r('timeout'),wait))]);
  await new Promise(r=>setTimeout(r,Number(process.env.WORLDLET_CAPTURE_SETTLE||'1500')));
  let probe:unknown=null;const stalled:string[]=[];
  if(process.env.WORLDLET_CAPTURE_PROBE){
   try{probe=await within(contents.executeJavaScript(process.env.WORLDLET_CAPTURE_PROBE,true),30000);}catch(error){probe='probe failed: '+error.message;}
   if(probe==='stalled'){probe='probe stalled for 30 s';stalled.push('probe');}
  }
  // capturePage can reject instead of stalling (01 RC, 2026-10-01, #1050): the rejection escaped this
  // handler, so no report was written and the check hung until it was killed. Each attempt is bounded
  // and caught; before a retry the window is restored and shown, repainted, and given two seconds.
  // A failure names its last error and the window state, so the cause shows in the check output.
  const window=BrowserWindow.fromWebContents(contents);
  const state=()=>window?{visible:window.isVisible(),minimized:window.isMinimized(),focused:window.isFocused(),bounds:window.getBounds()}:null;
  let image:NativeImage|null=null,failure='';
  for(let attempt=0;attempt<3&&!image;attempt++){
   if(attempt){if(window?.isMinimized())window.restore();if(window&&!window.isVisible())window.show();contents.invalidate();await new Promise(resolve=>setTimeout(resolve,2000));}
   try{const shot=await within(contents.capturePage(),15000);if(shot==='stalled')failure='stalled for 15 s';else if(shot.isEmpty())failure='empty frame';else image=shot;}
   catch(error){failure=String((error as Error)?.message||error);}
  }
  if(image)fs.writeFileSync(file,image.toPNG());else stalled.push(`capturePage (${failure}; window ${JSON.stringify(state())}; GPU exits ${gpuExits.length?gpuExits.join(', '):'none'})`);
  const notice=await within(contents.executeJavaScript(`document.getElementById('nativeNotice')?.textContent||''`),5000).catch(error=>'notice failed: '+String(error?.message||error));
  process.stdout.write(JSON.stringify({outcome:stalled.length?'error':outcome,notice,probe,stalled,gpuExits,errors:errors.slice(0,40)},null,1)+'\n');
  app.exit(outcome==='error'||stalled.length?1:0);
 })().catch(error=>{
  process.stdout.write(JSON.stringify({outcome:'error',stalled:['capture: '+String(error?.message||error)],gpuExits,errors:errors.slice(0,40)},null,1)+'\n');
  app.exit(1);
 }));
}
