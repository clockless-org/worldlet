// The Node host's program (scripts/build-node-host.ts bundles it as worldlet.cjs): `node worldlet.cjs <command>` is the
// `worldlet` command line, which asks the running host over its control socket (control.ts); anything else runs the
// host itself (main.ts), which is loaded only then.
import path from 'node:path';
import {CONTROL_COMMANDS,controlSocketPath,runControlCommand} from './control.ts';
import {profileFrom} from '../../electron/src/profile.ts';

const command=process.argv[2];
if((CONTROL_COMMANDS as readonly string[]).includes(command)||command==='help'||command==='--help'){
 // The same library the host opens (main.ts).
 const profile=profileFrom({packaged:true,resourcesPath:__dirname,appPath:__dirname,rootOverride:true});
 void runControlCommand(process.argv.slice(2).filter(arg=>arg!=='--help'&&arg!=='help'),controlSocketPath(path.resolve(profile.root))).then(code=>{process.exitCode=code;});
}else void import('./main.ts');
