import fs from 'node:fs';
import {app,screen,type BaseWindow,type WebContentsView} from 'electron';
/** Release smoke (#987): the real app on its own data captures its World once painted, writes the PNG and
 * a `worldlet-window-capture/1` report beside it, then quits. `Worldlet --window-capture <png> [--after <s>]`.
 * capturePage reads the app's own rendering, so no Screen Recording permission is involved.
 * scripts/release-smoke-mac.mjs launches the app this way and judges the pixels; this file reports facts. */
export interface CaptureRequest {png:string;after:number|null}
/** Seconds: the World window must appear within `window`, then gets `paint` for a first frame and `settle` more. */
export const CAPTURE_TIMING={window:90,paint:20,settle:3,poll:0.1};
export const CAPTURE_USAGE='Usage: Worldlet --window-capture <absolute path>.png [--after <seconds 0-60>]';
/** null without --window-capture; malformed arguments are a usage error, never a silent default. */
export function captureRequest(argv:string[]):CaptureRequest|null {
 const flag=argv.indexOf('--window-capture');
 if(flag<0)return null;
 const png=argv[flag+1];
 if(!png||!png.startsWith('/')&&!/^[A-Za-z]:[\\/]/.test(png)||png.length<=5||!png.toLowerCase().endsWith('.png'))throw Error(CAPTURE_USAGE);
 let after:number|null=null;
 const index=argv.indexOf('--after');
 if(index>=0){const value=Number(argv[index+1]);if(!Number.isFinite(value)||value<0||value>60)throw Error(CAPTURE_USAGE);after=value;}
 return {png,after};
}
const reportPath=(png:string)=>png.slice(0,-4)+'.json';
const sleep=(seconds:number)=>new Promise(resolve=>setTimeout(resolve,seconds*1000));
function base(request:CaptureRequest,launchedAt:Date){
 return {format:'worldlet-window-capture/1',png:request.png,after:request.after,pid:process.pid,launchedAt:launchedAt.toISOString(),error:null as string|null,
  app:{path:process.execPath,bundleIdentifier:process.platform==='darwin'?'app.worldlet.mac':'',version:app.getVersion(),build:''}};
}
function write(report:Record<string,unknown>,request:CaptureRequest){fs.writeFileSync(reportPath(request.png),JSON.stringify(report,null,2));}
/** Another running copy shares this app's data, so the capture refuses before any window opens. */
export function refuseBesideRunningCopy(request:CaptureRequest){
 const report={...base(request,new Date()),error:'Another Worldlet is running with the same data; quit it, then run the smoke again.'};
 write(report,request);
}
/** Waits for the World window and its first painted frame (+settle, or exactly `after`), captures, reports. */
export async function runCapture(request:CaptureRequest,launchedAt:Date,world:()=>{window:BaseWindow,view:WebContentsView}|null){
 const report:Record<string,any>=base(request,launchedAt);
 let painted=0,found=world();
 const windowDeadline=Date.now()+CAPTURE_TIMING.window*1000;
 while((!found||!found.window.isVisible())&&Date.now()<windowDeadline){await sleep(CAPTURE_TIMING.poll);found=world();}
 if(!found||!found.window.isVisible()){report.error=`The main window did not appear within ${CAPTURE_TIMING.window} s.`;write(report,request);return report;}
 const {window,view}=found;
 view.webContents.beginFrameSubscription(false,()=>{painted+=1;});
 report.windowAt=new Date().toISOString();
 if(request.after!==null)await sleep(request.after);
 else{
  const paintDeadline=Date.now()+CAPTURE_TIMING.paint*1000;
  while(painted===0&&Date.now()<paintDeadline)await sleep(CAPTURE_TIMING.poll);
  if(painted>0){report.paintedAt=new Date().toISOString();await sleep(CAPTURE_TIMING.settle);}
 }
 view.webContents.endFrameSubscription();
 const bounds=window.getBounds(),content=window.getContentBounds(),scale=screen.getDisplayMatching(bounds).scaleFactor;
 report.world={paintedFrames:painted,accelerated:app.getGPUFeatureStatus().gpu_compositing?.startsWith('enabled')??false};
 report.window={number:window.id,title:window.getTitle(),width:bounds.width,height:bounds.height,scale,titleBarHeight:Math.max(0,bounds.height-content.height),visible:window.isVisible(),onActiveSpace:true};
 report.screenRecordingGranted=null;
 const image=await view.webContents.capturePage();
 report.capturedAt=new Date().toISOString();
 const size=image.getSize();
 if(image.isEmpty()||!size.width||!size.height){report.error='No image of the World view was returned.';write(report,request);return report;}
 // The World view is the window's content area, so there is no title bar band to crop.
 report.image={width:size.width,height:size.height,contentTop:0};
 try{fs.writeFileSync(request.png,image.toPNG());}catch{report.error=`Could not write ${request.png}.`;}
 write(report,request);return report;
}
