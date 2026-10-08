import assert from 'node:assert/strict';
import {villageLightingState} from '../ui/world/village-lighting-state.ts';
const day=villageLightingState({daylight:1,progress:.5,kind:'clear',cloud:0});
const night=villageLightingState({daylight:0,progress:1,kind:'clear',cloud:0});
assert.equal(day.smoke,true,'chimney smoke is a daytime detail');
assert.equal(night.smoke,false,'no smoke at night');
assert.equal(villageLightingState({daylight:.5}).smoke,false,'no smoke during twilight');
assert.equal(day.lamps,0);assert.equal(night.lamps,1);
assert.ok(night.rgb.every(v=>v>0&&v<1),'night stays readable');
assert.ok(night.rgb[2]>night.rgb[0],'night light is cool');
assert.equal(villageLightingState({daylight:1,kind:'rain',cloud:.8}).rain,1);
assert.equal(villageLightingState({daylight:1,kind:'snow',cloud:.8}).snow,1);
assert.equal(villageLightingState({daylight:1,kind:'unknown',cloud:1}).rain,0);
const weatherDay=villageLightingState({daylight:1,progress:.5,kind:'storm',cloud:1});
assert.deepEqual(weatherDay.rgb,day.rgb,'weather must not change world exposure');
assert.equal(weatherDay.sunVisibility,day.sunVisibility,'weather must not hide the daylight treatment');
for(let d=0;d<1;d+=.01){const a=villageLightingState({daylight:d,progress:.8}),b=villageLightingState({daylight:d+.001,progress:.8});assert.ok(Math.abs(a.lamps-b.lamps)<.02,'no abrupt lamp switch');}
for(const state of [{},{daylight:NaN,cloud:Infinity,progress:-100}])assert.ok([...villageLightingState(state).rgb,villageLightingState(state).lamps].every(Number.isFinite));
console.log('PASS continuous lighting, weather separation, readable night and safe defaults');
