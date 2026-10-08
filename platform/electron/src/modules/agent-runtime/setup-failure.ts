/** The person reads why setup stopped, in plain words, from the step install.sh last
 * announced and its exit code; the full output stays in `setup.log` beside the runtime. */
export function setupFailure(step:string,detail:string){
 const code=Number(/exit (\d+)\)/.exec(detail)?.[1]??NaN);
 const safe=' Your world and accounts are safe.';
 if(code===13)return 'Fox setup could not start because another Worldlet window is still setting up. Wait a moment and ask Fox to try again.'+safe;
 if(step==='download')return 'Fox could not download its setup files from GitHub. Check your internet connection and ask Fox to try again.'+safe;
 if(code===12||step==='verify')return 'The Fox files downloaded from GitHub did not match what this version of Worldlet expects. Ask Fox to try again; if it happens again, update Worldlet.'+safe;
 const reason=lastError(detail);
 const what=step==='python'?'Fox could not get Python ready':step==='dependencies'?'Fox could not install the Python packages it needs':step==='validate'?'Fox installed its packages, but they did not start correctly':step==='extract'?'Fox could not unpack its setup files':'Fox could not finish setup';
 return what+(reason?': '+reason:'')+'. Ask Fox to try again.'+safe;
}
/** The last line of tool output that reads like an error, shortened for the conversation. */
function lastError(detail:string){
 const lines=detail.replace(/^Fox setup \([^)]*\) could not finish: ?/,'').split(/\r?\n/).map(line=>line.replace(/\x1b\[[0-9;]*m/g,'').trim()).filter(line=>line&&!line.startsWith('worldlet-setup-step:')&&!line.startsWith('+'));
 const line=[...lines].reverse().find(line=>/error|fail|denied|not found|no such|unable|cannot|could not|timed out/i.test(line))??lines.at(-1)??'';
 const text=line.replace(/^(error|fatal|caused by):\s*/i,'').replace(/\.$/,'');
 return text.length>180?text.slice(0,177)+'…':text;
}
