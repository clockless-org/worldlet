// Reports a CI release candidate (.github/workflows/rc.yml, docs/RELEASING.md) as GitHub Issues (owner decision
// 2026-10-08: "RC失败时开Issue吧，交AI云端修复"). A failing RC opens one Issue per platform and failure signature (the
// failing gates); the same failure again only adds a comment, so a broken main does not open an Issue per push. A
// passing RC closes that platform's open RC Issues. A cloud AI session picks the Issues up and fixes them with a
// normal pull request.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const LABEL='rc-failure';
export const PLATFORMS={darwin:'mac',win32:'windows',mac:'mac',windows:'windows'};
const marker=(platform,signature)=>`<!-- rc-failure platform=${platform} signature=${signature} -->`;
const platformMarker=platform=>`<!-- rc-failure platform=${platform} `;

// The outcome of one platform's RC job: its gate results when the gate ran, otherwise the job's own result.
export function outcome({results,job}){
 if(job==='cancelled'||job==='skipped')return {state:'none'};
 const failing=(results?.results||[]).filter(r=>!r.ok).map(r=>r.command).sort();
 if(job==='success'&&!failing.length)return {state:'pass'};
 return {state:'fail',failing,signature:failing.length?failing.join(','):'setup'};
}

export function issueBody({platform,failing,signature,sha,runURL}){
 const gates=failing.length?failing.map(g=>`- \`npm run ${g}\``).join('\n'):'- No gate ran: the job failed while preparing (checkout, install, Hermes runtime). See the run log.';
 return `${marker(platform,signature)}
The ${platform} release candidate failed at ${sha}.

Failing gates:
${gates}

Run: ${runURL}

Fix it with a normal pull request (AGENTS.md): reproduce from the run log, find the cause, change the code or the check, and run \`npm run check:pr\`. Never skip, disable or quarantine a check to make it pass. This Issue closes itself when the ${platform} RC passes again.`;
}

export function report({platform,state,failing=[],signature,sha,runURL,gh}){
 const open=JSON.parse(gh(['issue','list','--label',LABEL,'--state','open','--limit','100','--json','number,body'])||'[]');
 const mine=open.filter(i=>(i.body||'').includes(platformMarker(platform)));
 if(state==='pass'){
  for(const i of mine)gh(['issue','close',String(i.number),'--reason','completed','--comment',`The ${platform} RC passes at ${sha}: ${runURL}`]);
  return {closed:mine.map(i=>i.number)};
 }
 if(state!=='fail')return {};
 const same=mine.find(i=>i.body.includes(marker(platform,signature)));
 if(same){gh(['issue','comment',String(same.number),'--body',`Still failing at ${sha}: ${runURL}`]);return {commented:same.number};}
 for(const [name,color] of [[LABEL,'d73a4a'],[`platform:${platform}`,'0e8a16']])gh(['label','create',name,'--color',color,'--force']);
 const title=`[RC][${platform}] ${failing.length?failing.join(', '):'setup'} failing`;
 const url=gh(['issue','create','--title',title,'--label',LABEL,'--label',`platform:${platform}`,'--body',issueBody({platform,failing,signature,sha,runURL})]);
 return {created:url.trim()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:'';};
 const platform=PLATFORMS[arg('platform')];
 if(!platform)throw Error('--platform mac|windows');
 // The gate's results file, passed through the platform job's output (RC_RESULTS); empty when the gate never ran.
 const results=process.env.RC_RESULTS?JSON.parse(process.env.RC_RESULTS):null;
 const gh=args=>{const r=spawnSync('gh',args,{encoding:'utf8'});if(r.status!==0)throw Error(`gh ${args.slice(0,2).join(' ')}: ${r.stderr.trim()}`);return r.stdout;};
 const o=outcome({results,job:arg('job')});
 console.log(JSON.stringify({platform,...o,...report({platform,...o,sha:arg('sha'),runURL:arg('run'),gh})}));
}
