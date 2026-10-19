// Scene refreshes are not navigation. Coalesce address changes independently
// of rendering so WebKit's History API limit cannot interrupt the interface.
export function createLocationWriter(target=window,interval=250){
 let pending:string|null=null,timer:ReturnType<typeof setTimeout>|null=null,last=-Infinity;
 const cancel=()=>{pending=null;if(timer!==null)clearTimeout(timer);timer=null;};
 const flush=()=>{
  timer=null;const next=pending;pending=null;
  if(!next||next===target.location.href)return;
  try{target.history.replaceState(target.history.state,'',next);last=Date.now();}
  catch(error){
   if(error?.name!=='SecurityError')throw error;
   // URL persistence is optional; a throttled WebKit must not break navigation.
   last=Date.now()+10000;
  }
 };
 target.addEventListener('hashchange',cancel);
 target.addEventListener('popstate',cancel);
 return (url:URL)=>{
  const next=url.href;
  if(next===target.location.href){cancel();return;}
  pending=next;
  if(timer!==null)return;
  const delay=Math.max(0,interval-(Date.now()-last));
  if(delay)timer=setTimeout(flush,delay);else flush();
 };
}
