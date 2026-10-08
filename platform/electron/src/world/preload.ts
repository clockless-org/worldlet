import {contextBridge,ipcRenderer} from 'electron';
// Installed before any application script, only in the trusted top-level World document.
// Website views never load this preload, so their scripts never see the host bridge.
if(window.top===window&&location.origin==='worldlet://app'&&location.pathname==='/index.html'&&!location.search){
 const platform=ipcRenderer.sendSync('worldlet:platform');
 const request=async(body:Record<string,unknown>)=>{
  const reply=await ipcRenderer.invoke('worldlet:request',body);
  if(!reply||reply.ok!==true)throw new Error(reply?.error||'Worldlet did not respond. Please try again.');
  return reply.value;
 };
 contextBridge.exposeInMainWorld('worldletHost',{version:1,platform,request});
}
