// One desktop host on every OS; keep command selection out of npm shell syntax so PowerShell/cmd work.
import {spawn} from 'node:child_process';
const command=process.argv[2]||'dev';
if(!['dev','build'].includes(command))throw Error('Use dev or build.');
const child=spawn(process.execPath,[command==='build'?'scripts/build-app.ts':'scripts/dev-electron.ts',...process.argv.slice(3)],{stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
