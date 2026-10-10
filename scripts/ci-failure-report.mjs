// Reports a release stage's tests (docs/RELEASING.md) as GitHub Issues (owner decisions 2026-10-08: "失败时开Issue吧，
// 交AI云端修复", and 2026-10-09: the stages are Dev, Alpha, Beta and GA). The Dev tests run in CI (release.yml); Alpha and
// Beta run on the release machines. A failure opens one Issue per stage, platform and failure signature (the failing
// gates or jobs); the same failure again only adds a comment, so a broken main does not open an Issue per push. A pass
// closes that stage and platform's open Issues. A cloud AI session picks the Issues up and fixes them with a normal
// pull request.
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const LABEL='test-failure';
export const STAGES=['dev','alpha','beta'];
export const PLATFORMS={darwin:'mac',win32:'windows',linux:'linux',mac:'mac',windows:'windows'};
const marker=(stage,platform,signature)=>`<!-- test-failure stage=${stage} platform=${platform} signature=${signature} -->`;
const platformMarker=(stage,platform)=>`<!-- test-failure stage=${stage} platform=${platform} `;
const Stage=stage=>stage[0].toUpperCase()+stage.slice(1);

// The outcome of one platform's tests: the failing gates (or CI jobs) when they ran, otherwise the job's own result.
export function outcome({results,job,failed=[]}){
 if(job==='cancelled'||job==='skipped')return {state:'none'};
 const failing=[...new Set([...(results?.results||[]).filter(r=>!r.ok).map(r=>r.command),...failed])].sort();
 if(job==='success'&&!failing.length)return {state:'pass'};
 // A release machine adds each failed gate's first error line (`error`), so the Issue names the cause without its log.
 // It may add the whole failing block too (`details`: the assertion with its actual and expected lines, the file:line
 // frame, a parity check's fixture messages), so the fixer needs no log from the machine.
 const errors={},details={};
 for(const r of results?.results||[]){
  if(!r.ok&&typeof r.error==='string'&&r.error.trim()&&!errors[r.command])errors[r.command]=errorLine(r.error);
  if(!r.ok&&typeof r.details==='string'&&r.details.trim()&&!details[r.command])details[r.command]=detailBlock(r.details);
 }
 return {state:'fail',failing,signature:failing.length?failing.join(','):'setup',...(Object.keys(errors).length?{errors}:{}),...(Object.keys(details).length?{details}:{})};
}

// The gate results of one platform's parts (each part's gate.json, downloaded under `dir`), as one result list; null
// when no part's gate ran.
export function partResults(dir,platform){
 const files=[],walk=d=>{for(const e of readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else if(e.name.endsWith('.json'))files.push(f);}};
 if(dir&&existsSync(dir))walk(dir);
 const parts=files.map(f=>JSON.parse(readFileSync(f,'utf8'))).filter(r=>PLATFORMS[r.platform]===platform);
 return parts.length?{platform,results:parts.flatMap(r=>r.results||[])}:null;
}

const errorLine=text=>text.trim().split('\n')[0].replace(/`/g,"'").slice(0,240);
const errorNote=(g,errors)=>errors?.[g]?`: ${errors[g]}`:'';
// At most 60 lines and 4,000 characters per gate, fenced so Markdown leaves it alone (GitHub caps a body at 65,536).
export const DETAIL_LINES=60,DETAIL_CHARS=4000;
const detailBlock=text=>{const lines=String(text).replace(/\r/g,'').replace(/```/g,"'''").trimEnd().split('\n');const kept=lines.slice(0,DETAIL_LINES).join('\n').slice(0,DETAIL_CHARS);return kept+(lines.length>DETAIL_LINES||kept.length===DETAIL_CHARS?'\n…':'');};
const detailSection=(failing,details)=>failing.filter(g=>details?.[g]).map(g=>`\n<details open><summary>${g}</summary>\n\n\`\`\`text\n${details[g]}\n\`\`\`\n</details>`).join('\n');
export function issueBody({stage,platform,failing,signature,sha,runURL,errors,details}){
 const gates=failing.length?failing.map(g=>(/^[\w:-]+$/.test(g)?`- \`npm run ${g}\``:`- ${g}`)+errorNote(g,errors)).join('\n'):'- Nothing ran: the job failed while preparing (checkout, install, Hermes runtime). See the run log.';
 return `${marker(stage,platform,signature)}
The ${Stage(stage)} tests on ${platform} failed at ${sha}.

Failing:
${gates}
${detailSection(failing,details)}
Run: ${runURL}

Fix it with a normal pull request (AGENTS.md): reproduce from the run log, find the cause, change the code or the check, and run \`npm run check:pr\`. Never skip, disable or quarantine a check to make it pass. This Issue closes itself when the ${Stage(stage)} tests on ${platform} pass again.`;
}

export function report({stage='dev',platform,state,failing=[],signature,sha,runURL,errors,details,gh}){
 if(!STAGES.includes(stage))throw Error('stage must be one of '+STAGES.join(', '));
 const open=JSON.parse(gh(['issue','list','--label',LABEL,'--state','open','--limit','100','--json','number,body'])||'[]');
 const mine=open.filter(i=>(i.body||'').includes(platformMarker(stage,platform)));
 if(state==='pass'){
  for(const i of mine)gh(['issue','close',String(i.number),'--reason','completed','--comment',`The ${Stage(stage)} tests on ${platform} pass at ${sha}: ${runURL}`]);
  return {closed:mine.map(i=>i.number)};
 }
 if(state!=='fail')return {};
 const same=mine.find(i=>i.body.includes(marker(stage,platform,signature)));
 if(same){gh(['issue','comment',String(same.number),'--body',`Still failing at ${sha}: ${runURL}`+failing.filter(g=>errors?.[g]).map(g=>`\n- ${g}${errorNote(g,errors)}`).join('')+detailSection(failing,details)]);return {commented:same.number};}
 for(const [name,color] of [[LABEL,'d73a4a'],[`stage:${stage}`,'5319e7'],[`platform:${platform}`,'0e8a16']])gh(['label','create',name,'--color',color,'--force']);
 const title=`[${Stage(stage)}][${platform}] ${failing.length?failing.join(', '):'setup'} failing`;
 const url=gh(['issue','create','--title',title,'--label',LABEL,'--label',`stage:${stage}`,'--label',`platform:${platform}`,'--body',issueBody({stage,platform,failing,signature,sha,runURL,errors,details})]);
 return {created:url.trim()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:'';};
 const platform=PLATFORMS[arg('platform')],stage=arg('stage')||'dev';
 if(!platform)throw Error('--platform mac|windows|linux');
 // The gate results of the platform's parts, downloaded into --results (none when no gate ran), and/or --failed, the
 // names of failed CI jobs (the Dev tests).
 const results=partResults(arg('results'),platform),failed=arg('failed').split(',').map(n=>n.trim()).filter(Boolean);
 const gh=args=>{const r=spawnSync('gh',args,{encoding:'utf8'});if(r.status!==0)throw Error(`gh ${args.slice(0,2).join(' ')}: ${r.stderr.trim()}`);return r.stdout;};
 const o=outcome({results,job:arg('job'),failed});
 console.log(JSON.stringify({stage,platform,...o,...report({stage,platform,...o,sha:arg('sha'),runURL:arg('run'),gh})}));
}
