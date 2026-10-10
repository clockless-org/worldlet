// Quiet synthesized cues: no downloads, recording, or new audio permissions.
export function celebrationSound(context:AudioContext,kind:string){
 if(context.state!=='running')return;
 const now=context.currentTime;
 if(kind==='chime'){
  for(const [i,hz] of [523.25,659.25,783.99,1046.5].entries()){
   const tone=context.createOscillator(),gain=context.createGain(),start=now+i*.11;
   tone.frequency.value=hz;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.035,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+1.5);
   tone.connect(gain).connect(context.destination);tone.start(start);tone.stop(start+1.6);tone.onended=()=>{tone.disconnect();gain.disconnect();};
  }
  return;
 }
 const duration=kind==='launch'?.65:1.1,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 const noise=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();noise.buffer=buffer;
 filter.type=kind==='launch'?'bandpass':'lowpass';filter.frequency.setValueAtTime(kind==='launch'?600:1200,now);filter.frequency.exponentialRampToValueAtTime(kind==='launch'?1800:140,now+duration);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(kind==='launch'?.035:.13,now+(kind==='launch'?.22:.02));gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
 noise.connect(filter).connect(gain).connect(context.destination);noise.start();noise.stop(now+duration);noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
}
