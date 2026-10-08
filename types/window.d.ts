// What the app hangs on window: the hooks the Mac calls into the page, the
// WebKit message bridge, and the timings and fixtures the checks read back.
// Declared loosely; each is set by the module that owns it. The hooks the
// checks call bare are `var`s, which reach both `worldletStatus` and
// `window.worldletStatus`.
export {};
declare global {
 var worldletAgentTool: any;
 var worldletReceive: any;
 var worldletShowControls: any;
 var worldletStatus: any;
 interface Window {
  worldletAppUpdate: any;
  worldletBrowserNavigate: any;
  worldletApplyTextScale: any;
  worldletAudio: any;
  worldletLocalMusic: any;
  worldletBrowser: any;
  worldletCloudStream: any;
  worldletCodexEvent: any;
  worldletClaudeEvent?: any;
  worldletClaudeCancel?: any;
  worldletExecute: any;
  worldletFlushWrites: any;
  worldletFoxTimings: any;
  worldletAgentEvent: any;
  worldletSpeech: any;
  worldletStartupTimings: any;
  worldletXReader: any;
  worldletYouTubePlayer: any;
  webkit: any;
  __foxFrames: any;
 }
}
