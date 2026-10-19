export type WindowsPreview={formatVersion:1,version:string,build:number,architecture:'x64',signed:false,url:string,size:number,sha256:string,googleSignIn:boolean};
// The installer carries the website engine (CEF, #1170) since Build 1077, which took it past the former
// 300 MiB limit (#1037). Keep in step with platform/electron/src/modules/shell/windows-release.ts.
export const windowsInstallerLimit=1024*1024*1024;
export function windowsPreview(value:unknown):WindowsPreview{
 const v=value as WindowsPreview;
 // The error names the failing field (never its value), so a release log says what to fix (#1037).
 const invalid=!v?'value':v.formatVersion!==1?'formatVersion':v.architecture!=='x64'?'architecture':v.signed!==false?'signed'
  :typeof v.version!=='string'||!/^\d+\.\d+\.\d+$/.test(v.version)?'version':!Number.isSafeInteger(v.build)||v.build<1||v.build>65535?'build'
  :v.url!==`/downloads/Worldlet-${v.version}-${v.build}-windows-x64-unsigned.exe`?'url':!Number.isSafeInteger(v.size)||v.size<100000||v.size>windowsInstallerLimit?'size'
  :typeof v.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(v.sha256)?'sha256':typeof v.googleSignIn!=='boolean'?'googleSignIn':null;
 if(invalid)throw Error(`Invalid Windows preview manifest (${invalid})`);
 return {formatVersion:1,version:v.version,build:v.build,architecture:'x64',signed:false,url:v.url,size:v.size,sha256:v.sha256,googleSignIn:v.googleSignIn};
}
export async function latestWindowsPreview(){
 const response=await fetch('/downloads/windows-preview.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Windows preview is not published');
 const release=windowsPreview(await response.json());
 const artifact=await fetch(release.url,{method:'HEAD',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!artifact.ok||Number(artifact.headers.get('content-length'))!==release.size)throw Error('Windows installer is unavailable');
 return release;
}
/** Primary Windows channel. The direct EXE and its updater feed stay available for existing installs. */
export const microsoftStoreUrl='https://apps.microsoft.com/detail/9P608B0R3F0Z';
