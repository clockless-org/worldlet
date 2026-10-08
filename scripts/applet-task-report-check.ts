import assert from 'node:assert/strict';
import {reportLine} from '../ui/companion/applet-task-results.ts';
// An Applet task's result comes back to Fox's card as a one-sentence report (owner Order 2026-10-07).
assert.equal(reportLine('Found three videos under ten minutes. The first is from **Joshua**, then two shorter ones.'),'Found three videos under ten minutes.');
assert.equal(reportLine('已经找到三个视频。第一个最短。'),'已经找到三个视频。');
assert.equal(reportLine('Added [the order](https://example.com/o/1) to your cart\n\nTotal $42'),'Added the order to your cart Total $42');
const long=reportLine('x'.repeat(400));assert.equal(long.length,140);assert.ok(long.endsWith('…'));
console.log('PASS Applet task results report back in one short sentence');
