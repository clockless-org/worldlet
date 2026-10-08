import {isPresentationAction,type PresentationRequest} from '../../contracts/presentation.ts';
import {utf8Length} from '../companion/index.ts';
import {validateOverlay} from './world-schema.ts';
const sampleKeys=new Set(['dataset-version','kyoto-stay','decisions','items','aladdin-content-v1:sample']);
/** One validation policy before native persistence. No files or preference APIs. */
export function readPresentationRequest(input:unknown):PresentationRequest {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid presentation request');
 const value=input as Record<string,unknown>;
 if(!isPresentationAction(value.action))throw Error('Unknown presentation action');
 const field=value.action==='setTextScale'?'value':'state';
 if(Object.keys(value).some(key=>key!=='action'&&key!==field))throw Error('Unknown presentation field');
 if(value.action==='setTextScale'){
  if(![1,1.25,1.5,2].includes(value.value as number))throw Error('Choose a supported text size.');
 }else if(value.action==='saveOverlay')validateOverlay(value.state);
 else {
  const state=value.state;
  if(!state||typeof state!=='object'||Array.isArray(state)||Object.entries(state).some(([key,v])=>!sampleKeys.has(key)||typeof v!=='string')||utf8Length(JSON.stringify(state))>1500000)throw Error('Invalid practice state.');
 }
 return value as unknown as PresentationRequest;
}
