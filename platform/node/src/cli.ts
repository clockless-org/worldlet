// The Node host's program (scripts/build-node-host.ts bundles it as worldlet.cjs): `node worldlet.cjs <command>` is the
// `worldlet` command line, which asks the running host over its control socket (control.ts); with no command (only
// options, such as --host-contract-check) it runs the host itself (main.ts), which is loaded only then, and only when no
// host already answers on the same library.
import path from 'node:path';
import {ALREADY_RUNNING,CONTROL_USAGE,controlAnswers,controlSocketPath,runControlCommand} from './control.ts';
import {profileFrom} from '../../electron/src/profile.ts';

const command=process.argv[2];
// The same library the host opens (main.ts).
const profile=profileFrom({packaged:true,resourcesPath:__dirname,appPath:__dirname,rootOverride:true});
const socket=controlSocketPath(path.resolve(profile.root));
if(command==='help'||command==='--help'||command==='-h')process.stdout.write(CONTROL_USAGE+'\n');
// A command, known or not: an unknown one prints the usage instead of starting a second host.
else if(command!==undefined&&!command.startsWith('-'))void runControlCommand(process.argv.slice(2),socket).then(code=>{process.exitCode=code;});
else void controlAnswers(socket).then(running=>{
 if(!running)return void import('./main.ts');
 process.stderr.write(`worldlet: ${ALREADY_RUNNING}\n`);process.exitCode=1;
});
