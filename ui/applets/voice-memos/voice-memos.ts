// Playback lives in AVPlayer, never in a browser or an uploaded audio blob.
export function createVoiceMemoReader({call,record,sample,onChange}){
 const element=document.createElement('section');element.className='app-source-body voice-memo-reader';
 const caption=document.createElement('p');caption.className='ui-caption';caption.textContent='Loading recording…';
 const progress=document.createElement('progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','Recording position');
 const transcript=document.createElement('pre');transcript.className='voice-memo-transcript';
 element.append(caption,progress,transcript);
 let disposed=false,timer,reading=false,ready=false,playing=false,position=0,duration=0,text='',error='',shown='';
 const clock=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
 // The 750 ms position poll updates this pane in place; only changed actions or context resync the HUD, which rebuilds its buttons.
 function render(){caption.textContent=error||`${clock(position)} / ${clock(duration)} · ${playing?'Playing':'Paused'} · On this Mac`;progress.max=duration||1;progress.value=position;const key=JSON.stringify([ready,playing,Math.round(duration),error]);if(key!==shown){shown=key;onChange();}}
 async function action(operation,extra={}){if(disposed||!ready)return;try{const value=await call({operation,id:record.id,...extra});if(disposed)return;playing=!!value.playing;position=value.position||0;error=value.error||'';render();}catch(e){if(!disposed){error=e.message;render();}}}
 async function status(){if(disposed||reading||!ready||sample)return;reading=true;try{const value=await call({operation:'status'});if(disposed)return;if(value.id!==record.id){playing=false;return;}playing=!!value.playing;position=value.position||0;if(value.duration>0)duration=value.duration;error=value.error||'';render();}catch(e){if(!disposed){error=e.message;render();}}finally{reading=false;}}
 const load=sample?Promise.resolve({duration:0,transcript:record.sampleText||'Fictional recording. No personal audio is loaded.'}):call({operation:'select',id:record.id});
 load.then(value=>{if(disposed)return;duration=value.duration||0;text=value.transcript||'';ready=!sample;transcript.textContent=text||'No transcript is available for this recording yet.';const source=document.createElement('small');source.textContent=sample?'Fictional sample · No audio':text?(value.transcriptSource||'Transcript supplied by the matching local text file'):'Audio only · No transcription or upload';element.append(source);render();if(sample)caption.textContent='Sample recording · No audio';else timer=setInterval(status,750);}).catch(e=>{if(!disposed){error=e.message;render();}});
 function dispose(){if(disposed)return;disposed=true;clearInterval(timer);if(!sample)void call({operation:'stop'}).catch(()=>{});}
 return {element,dispose,context(){return {context:{key:'voice-memo:'+record.id,title:'Voice Memos · '+record.title,detail:(sample?'Fictional sample. ':`Local recording, ${Math.round(duration)} seconds. `)+(text?'Supplied transcript:\n'+text.slice(0,8000):'No transcript. Do not infer spoken content.')},actions:ready?[{id:'memo:play',label:playing?'Pause':'Play',icon:playing?'pause':'play',kind:'navigation',placement:'contextual',run:()=>action(playing?'pause':'play')},{id:'memo:restart',label:'Start over',icon:'refresh',kind:'navigation',placement:'contextual',run:()=>action('seek',{position:0})}]:[]};}};
}
