// Capture mono 16 kHz PCM. Audio is never connected to the speakers.
class FoxPCM extends AudioWorkletProcessor {
 sum=0;count=0;phase=0;samples: number[]=[];
 constructor(){super();this.port.onmessage=(e: MessageEvent)=>{if(e.data==='flush')this.flush();};}
 flush(){if(this.samples.length){const data=Int16Array.from(this.samples);this.samples=[];this.port.postMessage(data.buffer,[data.buffer]);}this.port.postMessage('flushed');}
 override process(inputs: Float32Array[][]){const channels=inputs[0];if(!channels?.[0])return true;
  for(let i=0;i<channels[0].length;i++){let value=0;for(const channel of channels)value+=channel[i];this.sum+=value/channels.length;this.count++;this.phase+=16000;
   if(this.phase>=sampleRate){this.phase-=sampleRate;const value=Math.max(-1,Math.min(1,this.sum/this.count));this.samples.push(Math.round(value*(value<0?32768:32767)));this.sum=0;this.count=0;}
   if(this.samples.length>=1600){const data=Int16Array.from(this.samples);this.samples=[];this.port.postMessage(data.buffer,[data.buffer]);}
  }return true;
 }
}
registerProcessor('fox-pcm',FoxPCM);
