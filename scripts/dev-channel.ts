// Run the GitHub-integrated main preview (Electron) from any checkout.
import {spawn} from 'node:child_process';
import {workspace,git} from './dev-workspace.ts';
const cwd=workspace().primary;
if(git(cwd,'branch','--show-current')!=='main')throw Error('Primary checkout must remain on main.');
const child=spawn(process.execPath,['scripts/dev-electron.ts',...process.argv.slice(2)],{cwd,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
