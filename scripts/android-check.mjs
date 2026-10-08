// npm run test:android: the Android app on the Windows release gate (owner decision 2026-10-03: 01 tests Windows
// and Android, 02 tests Mac and iOS; pull requests only compile the app). The protocol library's tests (the
// pairing vector shared with the desktop and the iPhone), the demo UI tests on the JVM (Robolectric), then the
// instrumented UI tests (android/app/src/androidTest) in the real app on an Android emulator: pairing, Now, an
// item's card with Fox's dialogue, Later by a swipe, typing to Fox and Settings, on demo data, so no network,
// account or signing is needed.
// What it needs is set up in code (a host fix done in code, #1391): a JDK 17 or later (Temurin 17 is downloaded
// when none is found), and the Android SDK with an emulator and system image, installed with Google's command-line
// tools into ANDROID_HOME, or ~/.worldlet-android/sdk when no SDK exists. Both live outside the checkout, since RC
// gate checkouts are temporary (#1285). The emulator needs hardware acceleration (Windows Hypervisor Platform on
// Windows); without it the run fails with the emulator's own explanation.
// New gates are advisory until they have passed on their host (as test:onboarding:paths was): while BLOCKING is
// false a failure prints ADVISORY FAIL and passes. Logs, the APKs and the emulator's pictures stay in
// .local/android-build; the pictures also go to .local/electron-checks/android-frames for test:ui:review.
import {spawn,spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const BLOCKING=false;
const root=fileURLToPath(new URL('../',import.meta.url));
const project=path.join(root,'android'),out=path.join(root,'.local/android-build');
const windows=process.platform==='win32',mac=process.platform==='darwin';
const home=path.join(os.homedir(),'.worldlet-android');
const started=Date.now();
const fail=text=>{console.log(`${BLOCKING?'FAIL':'ADVISORY FAIL'} Android: ${text}`);process.exit(BLOCKING?1:0);};
const run=(bin,args,{cwd=project,minutes=20,env=process.env,input}={})=>{
 // A .bat runs through cmd, which splits arguments on ; and =, so those are quoted.
 const batch=windows&&/\.(bat|cmd)$/i.test(bin);
 const r=spawnSync(batch?`"${bin}"`:bin,batch?args.map(a=>/[\s;=,&]/.test(a)?`"${a}"`:a):args,{cwd,env,encoding:'utf8',timeout:minutes*60_000,maxBuffer:256*1024*1024,input,shell:batch,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});
 return {ok:r.status===0&&!r.error,out:(r.stdout||'')+(r.stderr||''),error:r.error};
};
const download=(url,file)=>{
 // curl ships with Windows 10 and later, macOS and Linux.
 const r=run('curl',['-fsSL','--retry','3','-o',file,url],{cwd:root,minutes:20});
 if(!r.ok)fail(`could not download ${url}: ${r.out.slice(-400)}`);
};
const unzip=(file,dir)=>{
 mkdirSync(dir,{recursive:true});
 // Windows' own tar (bsdtar) and macOS's read zip files; Linux uses unzip.
 const r=process.platform==='linux'?run('unzip',['-q','-o',file,'-d',dir],{cwd:root}):run('tar',['-xf',file,'-C',dir],{cwd:root});
 if(!r.ok)fail(`could not unpack ${file}: ${r.out.slice(-400)}`);
};

rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});

// A JDK 17 or later: JAVA_HOME, the one on PATH, or Temurin 17 downloaded once.
function javaHome(){
 const version=bin=>{const r=run(bin,['-version'],{cwd:root,minutes:1});const m=r.out.match(/version "(\d+)/);return r.ok&&m?Number(m[1]):0;};
 const java=dir=>path.join(dir,'bin',windows?'java.exe':'java');
 if(process.env.JAVA_HOME&&version(java(process.env.JAVA_HOME))>=17)return process.env.JAVA_HOME;
 const local=path.join(home,'jdk');
 const found=()=>{if(!existsSync(local))return null;for(const name of readdirSync(local)){for(const dir of [path.join(local,name),path.join(local,name,'Contents','Home')])if(existsSync(java(dir)))return dir;}return null;};
 if(found())return found();
 if(version('java')>=17){const r=run('java',['-XshowSettings:properties','-version'],{cwd:root,minutes:1});const m=r.out.match(/java\.home = (.+)/);if(m)return m[1].trim();}
 console.log('No JDK 17 or later found; downloading Temurin 17');
 const osName=windows?'windows':mac?'mac':'linux',arch=process.arch==='arm64'?'aarch64':'x64',ext=windows?'zip':'tar.gz';
 const file=path.join(home,`jdk.${ext}`);mkdirSync(home,{recursive:true});
 download(`https://api.adoptium.net/v3/binary/latest/17/ga/${osName}/${arch}/jdk/hotspot/normal/eclipse`,file);
 mkdirSync(local,{recursive:true});
 const r=run('tar',['-xf',file,'-C',local],{cwd:root});if(!r.ok)fail('could not unpack the JDK: '+r.out.slice(-400));
 rmSync(file,{force:true});
 return found()||fail('the downloaded JDK has no bin/java');
}

// The Android SDK with what the build and the emulator need, installed by Google's sdkmanager.
const ABI=process.arch==='arm64'?'arm64-v8a':'x86_64';
const IMAGE=`system-images;android-35;google_apis;${ABI}`;
function androidHome(env){
 const candidates=[process.env.ANDROID_HOME,process.env.ANDROID_SDK_ROOT,windows&&process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Android','Sdk'),mac&&path.join(os.homedir(),'Library','Android','sdk'),path.join(os.homedir(),'Android','Sdk'),path.join(home,'sdk')].filter(Boolean);
 const sdk=candidates.find(dir=>existsSync(path.join(dir,'platform-tools')))||candidates.find(dir=>existsSync(dir))||path.join(home,'sdk');
 const sdkmanager=path.join(sdk,'cmdline-tools','latest','bin',windows?'sdkmanager.bat':'sdkmanager');
 if(!existsSync(sdkmanager)){
  console.log(`Installing the Android command-line tools into ${sdk}`);
  const zip=path.join(home,'cmdline-tools.zip'),tmp=path.join(home,'cmdline-tools-unpack');mkdirSync(home,{recursive:true});
  download(`https://dl.google.com/android/repository/commandlinetools-${windows?'win':mac?'mac':'linux'}-13114758_latest.zip`,zip);
  rmSync(tmp,{recursive:true,force:true});unzip(zip,tmp);
  mkdirSync(path.join(sdk,'cmdline-tools'),{recursive:true});rmSync(path.join(sdk,'cmdline-tools','latest'),{recursive:true,force:true});
  const r=run(windows?'robocopy':'cp',windows?[path.join(tmp,'cmdline-tools'),path.join(sdk,'cmdline-tools','latest'),'/E','/NFL','/NDL','/NJH','/NJS']:['-R',path.join(tmp,'cmdline-tools'),path.join(sdk,'cmdline-tools','latest')],{cwd:root});
  // robocopy exits 1 when it copied files.
  if(!existsSync(sdkmanager))fail('could not place the command-line tools: '+r.out.slice(-400));
  rmSync(tmp,{recursive:true,force:true});rmSync(zip,{force:true});
 }
 const packages=['platform-tools','platforms;android-36','build-tools;36.0.0','emulator',IMAGE];
 const missing=packages.filter(p=>!existsSync(path.join(sdk,...p.split(';'))));
 if(missing.length){
  console.log('Installing Android SDK packages: '+missing.join(', '));
  run(sdkmanager,['--licenses',`--sdk_root=${sdk}`],{cwd:root,env,input:'y\n'.repeat(40),minutes:5});
  const r=run(sdkmanager,[`--sdk_root=${sdk}`,...missing],{cwd:root,env,input:'y\n'.repeat(40),minutes:40});
  writeFileSync(path.join(out,'sdkmanager.log'),r.out);
  const still=packages.filter(p=>!existsSync(path.join(sdk,...p.split(';'))));
  if(still.length)fail(`sdkmanager could not install ${still.join(', ')} (log .local/android-build/sdkmanager.log)`);
 }
 return sdk;
}

const jdk=javaHome();
// Windows spells it Path; keep one key.
const pathKey=Object.keys(process.env).find(k=>k.toUpperCase()==='PATH')||'PATH';
const env={...process.env,JAVA_HOME:jdk,[pathKey]:path.join(jdk,'bin')+path.delimiter+(process.env[pathKey]||'')};
const sdk=androidHome(env);
Object.assign(env,{ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,ANDROID_USER_HOME:path.join(home,'user'),ANDROID_AVD_HOME:path.join(home,'avd')});
console.log(`JDK ${jdk}\nAndroid SDK ${sdk}`);
const exe=name=>windows?name+'.exe':name;
const adb=path.join(sdk,'platform-tools',exe('adb')),emulator=path.join(sdk,'emulator',exe('emulator'));
const gradle=(args,minutes=40)=>run(path.join(project,windows?'gradlew.bat':'gradlew'),['--no-daemon','--console=plain',...args],{env,minutes});

// The fast part first: the protocol library and the demo UI tests on the JVM, and every APK.
const build=gradle([':kit:test',':app:testDebugUnitTest',':app:assembleDebug',':app:assembleDebugAndroidTest',':app:assembleRelease']);
writeFileSync(path.join(out,'build.log'),build.out);
if(!build.ok)fail('the Android build or its JVM tests failed (log .local/android-build/build.log):\n'+build.out.split('\n').filter(l=>/^e: |FAILED|error:|What went wrong/.test(l)).slice(0,40).join('\n'));
console.log('PASS Android protocol and demo UI tests (JVM)');
for(const [from,to] of [['app/build/outputs/apk/debug/app-debug.apk','worldlet-debug.apk'],['app/build/outputs/apk/release/app-release.apk','worldlet-release.apk']])
 if(existsSync(path.join(project,from)))copyFileSync(path.join(project,from),path.join(out,to));

// The emulator: one AVD made once, booted headless for this run and shut down after.
const AVD='worldlet-rc';
if(!existsSync(path.join(env.ANDROID_AVD_HOME,`${AVD}.avd`))){
 mkdirSync(env.ANDROID_AVD_HOME,{recursive:true});
 const avdmanager=path.join(sdk,'cmdline-tools','latest','bin',windows?'avdmanager.bat':'avdmanager');
 const r=run(avdmanager,['create','avd','--force','-n',AVD,'-k',IMAGE,'-d','pixel_7'],{cwd:root,env,input:'no\n',minutes:5});
 if(!r.ok)fail('could not create the emulator: '+r.out.slice(-600));
}
const accel=run(emulator,['-accel-check'],{cwd:root,env,minutes:2});
console.log('Emulator acceleration: '+(accel.out.trim().split(/\r?\n/).filter(l=>l&&l!=='accel'&&l!=='endaccel').join(' ')||'unknown'));
run(adb,['start-server'],{cwd:root,env,minutes:2});
const log=path.join(out,'emulator.log');
const child=spawn(emulator,['-avd',AVD,'-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader_indirect','-port','5584'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let emulatorLog='';child.stdout.on('data',d=>emulatorLog+=d);child.stderr.on('data',d=>emulatorLog+=d);
const serial='emulator-5584';
const sh=(...args)=>run(adb,['-s',serial,...args],{cwd:root,env,minutes:5});
let stopped=false;
const stop=()=>{if(stopped)return;stopped=true;sh('emu','kill');setTimeout(()=>child.kill(),5000).unref();writeFileSync(log,emulatorLog);};
// A failure with the emulator up shuts it down first (process.exit skips finally).
const bail=text=>{stop();fail(text);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let booted=false;
for(const until=Date.now()+8*60_000;Date.now()<until&&child.exitCode===null;){
 if(sh('shell','getprop','sys.boot_completed').out.trim()==='1'){booted=true;break;}
 await sleep(5000);
}
if(!booted){bail('the emulator did not boot (log .local/android-build/emulator.log):\n'+emulatorLog.split('\n').filter(l=>/ERROR|FATAL|accel|HAXM|hypervisor|WHPX|KVM/i.test(l)).slice(0,12).join('\n'));}
console.log('Emulator booted');
for(const key of ['window_animation_scale','transition_animation_scale','animator_duration_scale'])sh('shell','settings','put','global',key,'0');

try{
 const tests=gradle([':app:connectedDebugAndroidTest'],30);
 writeFileSync(path.join(out,'instrumented.log'),tests.out);
 const cases=tests.out.split('\n').filter(l=>/ > \w+\[.*\] (PASSED|FAILED)|Finished \d+ tests/.test(l));
 for(const line of cases)console.log('  '+line.trim());
 if(!tests.ok)bail('the instrumented UI tests failed (log .local/android-build/instrumented.log):\n'+tests.out.split('\n').filter(l=>/FAILED|AssertionError|Exception:/.test(l)).slice(0,40).join('\n'));

 // Pictures of the real app on demo data, for the record and for test:ui:review.
 const frames=path.join(root,'.local/electron-checks/android-frames');rmSync(frames,{recursive:true,force:true});mkdirSync(frames,{recursive:true});
 sh('install','-r',path.join(out,'worldlet-debug.apk'));
 const shots=[['pair',[]],['attention',['--ez','demo','true']],['later',['--ez','demo','true','--es','page','later']],['card',['--ez','demo','true','--es','card','t1']],['fox',['--ez','demo','true','--es','card','e1']]];
 const index={check:'android',startedAt:new Date(started).toISOString(),seconds:0,passed:true,frames:[],lines:[]};
 for(const [name,extras] of shots){
  sh('shell','am','force-stop','app.worldlet.android');
  sh('shell','am','start','-W','-n','app.worldlet.android/.MainActivity',...extras);
  await sleep(4000);
  const png=spawnSync(adb,['-s',serial,'exec-out','screencap','-p'],{env,maxBuffer:64*1024*1024});
  if(png.status===0&&png.stdout.length>1000){const file=`${name}.png`;writeFileSync(path.join(frames,file),png.stdout);copyFileSync(path.join(frames,file),path.join(out,file));
   const at=Date.now()-started;index.frames.push({file,at});index.lines.push({at,line:`Android ${name}`});}
 }
 index.seconds=Math.round((Date.now()-started)/1000);
 writeFileSync(path.join(frames,'index.json'),JSON.stringify(index,null,1));
 console.log(`PASS Android: instrumented UI tests on the emulator; ${index.frames.length} pictures in .local/android-build`);
}finally{stop();}
