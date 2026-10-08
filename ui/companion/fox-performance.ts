// One monotonic clock from submit (including the UI queue) to a paint opportunity.
// Only durations/counts leave this module; never text, URLs, IDs from user data.
export function foxTrace(){
 const start=performance.now(),marks={},id=crypto.randomUUID();let finished=false,checkpoint=null,lastStage='';
 const progress=()=>{checkpoint=null;window.dispatchEvent(new CustomEvent('worldlet:fox-timing',{detail:{id,outcome:'running',lastStage,...marks}}));};
 return {id,marks,mark(name){if(marks[name]===undefined){marks[name]=Math.round(performance.now()-start);lastStage=name;if(!finished&&!checkpoint)checkpoint=setTimeout(progress,250);}},
  finish(result: any={},outcome='complete'){
   if(finished)return;finished=true;if(checkpoint){clearTimeout(checkpoint);checkpoint=null;}this.mark('completeMs');
   let reported=false;
   const publish=()=>{
    if(reported)return;reported=true;
    const report={id,outcome,lastStage,...marks,...result.timings,contextChars:result.contextChars||0};
    window.worldletFoxTimings??=[];window.worldletFoxTimings.push(report);if(window.worldletFoxTimings.length>100)window.worldletFoxTimings.shift();
    window.dispatchEvent(new CustomEvent('worldlet:fox-timing',{detail:report}));
   };
   // A hidden WKWebView can suspend RAF indefinitely. Keep completion evidence,
   // leaving paintMs absent rather than pretending a hidden reply was painted.
   const timer=setTimeout(publish,1000);
   requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);this.mark('paintMs');publish();}));
  }
 };
}
