import assert from 'node:assert/strict';
import {reduceAgentResponse} from '../core/agent/agent-response.ts';
import {validateAgentEvent} from '../contracts/agent.ts';

// Recorded protocol phases are independent of which native host delivers them.
for(const host of ['macos','windows']) {
 let text='';
 const accept=(event:unknown)=>text=reduceAgentResponse(text,validateAgentEvent(event));
 accept({type:'delta',text:'Looking '});accept({type:'delta',text:'now'});
 assert.equal(text,'Looking now',host);
 accept({type:'status',stage:'model'});assert.equal(text,'Looking now');
 accept({type:'progress',name:'read_source'});assert.equal(text,'');
 accept({type:'delta',text:'Found it'});accept({type:'steered'});assert.equal(text,'');
 accept({type:'delta',text:'Revised'});accept({type:'response_start'});
 accept({type:'delta',text:'Final answer'});assert.equal(text,'Final answer');
 accept({type:'tool',id:'one',name:'read_source',args:{}});assert.equal(text,'Final answer');
 assert.throws(()=>accept({type:'delta',text:42}),/malformed/);
 assert.equal(text,'Final answer','invalid input does not corrupt accepted content');
}
console.log('PASS shared Agent stream segmentation across tool, steering and response phases');
