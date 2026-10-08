import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import type {Host,Row} from '../../host/types.ts';
import {releaseLaunch} from '../../../../../core/distribution/index.ts';
// Release identity and distribution settings. Development reads them from the checkout;
// the packager copies `platform/electron/distribution` to `<resources>/distribution` and
// the UI build's `build-info.json` beside it.
const readJSON=(file:string):Row|null=>{try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}};
export function distribution(host:Host,name:'Updates.json'|'Analytics.json'){
 return readJSON(app.isPackaged?path.join(host.profile.resources,'distribution',name):path.join(host.profile.resources,'platform/electron/distribution',name));
}
/** `{version, build, channel?, distributionChannel?, revision?}`; empty when the UI was never built. */
export function buildInfo(host:Host):Row {
 return (app.isPackaged?readJSON(path.join(host.profile.resources,'build-info.json')):null)??readJSON(path.join(host.profile.webRoot,'build-info.json'))??{};
}
export function buildNumber(host:Host){const build=Number(buildInfo(host).build);return Number.isSafeInteger(build)&&build>=0?build:0;}
export function versionText(host:Host){const info=buildInfo(host);return typeof info.version==='string'?info.version:'';}
/** The released app; development and command-line checks never report or update. A Windows login-item launch
 * counts (`releaseLaunch`): it used to send nothing and never update until the next manual start. */
export const releaseBuild=(host:Host)=>app.isPackaged&&host.profile.channel==='release'&&releaseLaunch(process.argv);
/** The packaged release app, whatever its arguments: the RC update acceptance (#1140) runs it with test flags. */
export const packagedRelease=(host:Host)=>app.isPackaged&&host.profile.channel==='release';
