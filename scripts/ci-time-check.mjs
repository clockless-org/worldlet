import assert from 'node:assert/strict';
import {summarise,runnerOs,format,LIMIT_SECONDS} from './ci-time.mjs';
const step={name:'run',conclusion:'success',started_at:'2026-10-05T01:00:05Z'};
const job=(name,labels,start,end,extra={})=>({name,labels,started_at:start,completed_at:end,conclusion:'success',steps:[step],...extra});
const arch=(id,created,end,extra=[])=>({id,name:'Architecture contracts',created_at:created,jobs:[
 job('Static checks',['ubuntu-latest'],created,'2026-10-05T01:01:30Z'),
 job('Architecture',['ubuntu-latest'],'2026-10-05T01:01:31Z',end),...extra]});
assert.equal(runnerOs(['macos-15']),'macos');
assert.equal(runnerOs(['self-hosted','macOS']),'self-hosted');
assert.equal(runnerOs(['ubuntu-latest']),'linux');
const s=summarise([
 arch(1,'2026-10-05T01:00:00Z','2026-10-05T01:02:00Z'),
 arch(2,'2026-10-05T01:00:00Z','2026-10-05T01:04:00Z'),
 // A run GitHub refused to start (billing) is counted apart, not as a fast run.
 {id:3,name:'Architecture contracts',created_at:'2026-10-05T01:00:00Z',jobs:[{name:'Architecture',labels:['ubuntu-latest'],started_at:'2026-10-05T01:00:01Z',completed_at:'2026-10-05T01:00:02Z',conclusion:'failure',steps:[]}]},
 // #1705's shape: its jobs ran but GitHub refused the Architecture job, so the run has no CI time (not 4:27 over 3:00),
 // and the refused job bills nothing.
 {id:5,name:'Architecture contracts',created_at:'2026-10-05T01:00:00Z',jobs:[
  job('Static checks',['ubuntu-latest'],'2026-10-05T01:00:00Z','2026-10-05T01:04:25Z'),
  {name:'Architecture',labels:['ubuntu-latest'],started_at:'2026-10-05T01:04:26Z',completed_at:'2026-10-05T01:04:27Z',conclusion:'failure',steps:[]}]},
 {id:4,name:'iOS',created_at:'2026-10-05T01:00:00Z',jobs:[job('Simulator build',['macos-15'],'2026-10-05T01:00:00Z','2026-10-05T01:03:10Z')]},
]);
assert.equal(s.runs,2);
assert.equal(s.p50,120);
assert.equal(s.max,240);
assert.equal(s.over,1,'one run over '+LIMIT_SECONDS+' s');
assert.equal(s.unstarted,2);
assert.equal(s.refusedJobs,2);
assert.equal(s.minutes.macos,4);
assert.equal(s.minutes.linux,13,'refused jobs bill nothing');
assert.match(format(s,1),/p50 2:00, p90 4:00, max 4:00; over 3:00: 1/);
assert.match(format(s,1),/not started by GitHub \(billing\): 2 Architecture runs, 2 jobs/);
console.log('PASS ci:time measures push-to-Architecture time, over-3-minute runs, billed minutes by OS of jobs that ran, and runs and jobs GitHub refused');
