import {projectNativeWorld} from './world-projection.ts';
// This entry is bundled separately and embedded by build-native-ui. The blob
// worker inherits the trusted page's no-network CSP and has no Host bridge.
self.onmessage=({data})=>{
 try{self.postMessage({id:data.id,world:projectNativeWorld(data.state)});}
 catch{self.postMessage({id:data.id,error:'Could not prepare world data.'});}
};
