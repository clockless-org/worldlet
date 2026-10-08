// Cancelling a Fox request only cancels that request's pending station connection.
// It must never pause a newer request or music that was already playing.
export async function runAudioCommand(call,args,signal?: AbortSignal){
 signal?.throwIfAborted();const requestID=crypto.randomUUID();
 const abort=()=>{call('cancelAudioRequest',{requestID}).catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{const result=await call('backgroundMusic',{...args,requestID});signal?.throwIfAborted();return result;}
 finally{signal?.removeEventListener('abort',abort);}
}
