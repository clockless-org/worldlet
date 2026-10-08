import assert from 'node:assert/strict';
import manifest from '../resources/styles/builtin/manifest.json' with {type:'json'};
import audit from '../resources/styles/builtin/drafts/remaining-bold/scale-audit.json' with {type:'json'};
import scales from '../ui/world/applet-optical-scales.json' with {type:'json'};
assert.deepEqual(Object.keys(scales).sort(),Object.keys(manifest.applets).sort());
for(const [key,scale] of Object.entries(scales)){
 assert(scale>=.75&&scale<=1.2,key+' bounded optical scale');
 assert(Math.max(...audit.measurements[key].body)*scale<=audit.bodyLimit+.001,key+' respects common visual envelope');
}
assert(scales.tiktok<1.1,'A sparse tall music mark must not be enlarged to 120%');
assert(scales.youtube===1,'Approved reference retains its size');
console.log('PASS all device silhouettes fit a shared size envelope without stretching');
