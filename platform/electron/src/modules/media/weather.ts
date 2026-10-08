import path from 'node:path';
import {WorldletError} from '../../files.ts';
import {WORLD_TOOLS,type WorldToolsService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {environment,readLimited,run,WINDOWS_BASE} from './io.ts';
import type {MediaSurface} from './surface.ts';

// Fixed-purpose weather transport. No model calls, source data, tokens or arbitrary URLs.
export function weatherURL(operation:string,params:Row){
 let base:string,query:Record<string,string>;
 if(operation==='search'){
  const name=params.name;
  if(typeof name!=='string'||!name.trim()||name.length>100)throw new WorldletError('Enter a city name.');
  base='https://geocoding-api.open-meteo.com/v1/search';
  query={name,count:'6',language:'en',format:'json'};
 }else if(operation==='forecast'){
  const lat=params.latitude,lon=params.longitude;
  if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new WorldletError('Please choose a valid city.');
  base='https://api.open-meteo.com/v1/forecast';
  query={latitude:String(Math.round(lat*100)/100),longitude:String(Math.round(lon*100)/100),current:'temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day',daily:'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',timezone:'auto',timeformat:'unixtime',forecast_days:'7'};
 }else throw new WorldletError('Unsupported weather request.');
 const search=new URLSearchParams(Object.entries(query).sort(([a],[b])=>a<b?-1:a>b?1:0));
 return `${base}?${search.toString().replace(/\+/g,'%20')}`;
}
async function weatherRequest(operation:string,params:Row){
 const url=weatherURL(operation,params);
 let response:Response;
 try{response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20_000)});}
 catch{throw new WorldletError('Weather is unavailable. Please try again later.');}
 let data:Buffer;
 try{if(response.status!==200)throw Error();data=await readLimited(response,99_999);}
 catch{void response.body?.cancel().catch(()=>{});throw new WorldletError('Weather is unavailable. Please try again later.');}
 return JSON.parse(data.toString('utf8'));
}

// Windows: the system location service through .NET's GeoCoordinateWatcher.
const LOCATE_POWERSHELL=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Device;
$w=New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High);
if(-not $w.TryStart($false,[TimeSpan]::FromSeconds(15))){ '{"error":"denied"}'; exit 0 }
$until=(Get-Date).AddSeconds(15);
while((Get-Date) -lt $until){ if($w.Permission -eq 'Denied'){ '{"error":"denied"}'; exit 0 }; $p=$w.Position; if($p -and -not $p.Location.IsUnknown){ $c=$p.Location; @{latitude=$c.Latitude;longitude=$c.Longitude;accuracy=$c.HorizontalAccuracy;at=$p.Timestamp.ToUnixTimeMilliseconds()} | ConvertTo-Json -Compress; exit 0 }; Start-Sleep -Milliseconds 250 }
'{"error":"timeout"}'`;
let locating=false;
/** macOS asks CoreLocation through Chromium's geolocation in the media surface, so the
 * permission belongs to this app bundle (a helper process could never be authorized);
 * Windows asks the system location service. Elsewhere location fails explicitly. */
async function weatherLocate(surface:MediaSurface):Promise<Row> {
 if(locating)throw new WorldletError('Getting your location.');
 if(process.platform!=='darwin'&&process.platform!=='win32')throw new WorldletError('Location is unavailable on this computer. Search for a city instead.');
 locating=true;
 let value:Row;
 try{
  if(process.platform==='darwin'){
   surface.allowLocation=true;
   try{value=await Promise.race([surface.call<Row>('locate'),new Promise<Row>(resolve=>setTimeout(()=>resolve({error:'timeout'}),20_000))]);}
   finally{surface.allowLocation=false;}
  }else{
   const command=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
   const result=await run(command,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',LOCATE_POWERSHELL],{env:environment(WINDOWS_BASE),timeout:22_000,limit:4000,timeoutMessage:'Location timed out. Choose a city manually.'});
   try{value=JSON.parse(result.stdout.toString('utf8').trim());}catch{throw new WorldletError('Could not get your location. Search for a city.');}
  }
 }finally{locating=false;}
 if(value?.error==='denied')throw new WorldletError(process.platform==='win32'?'Location is not allowed. Choose a city or allow location access in Windows Settings.':'Location is not allowed. Search for a city or allow Worldlet in System Settings.');
 if(value?.error==='timeout')throw new WorldletError('Location timed out. Choose a city manually.');
 const {latitude,longitude,accuracy,at}=value??{};
 if(![latitude,longitude,accuracy,at].every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||Math.abs(Date.now()-at)>300_000)throw new WorldletError('Could not get your location. Search for a city.');
 return {name:'Current location',latitude:Math.round(latitude*10000)/10000,longitude:Math.round(longitude*10000)/10000,source:'device',locatedAt:at,accuracy};
}

export function weatherActions(host:Host,surface:MediaSurface){
 return {
  weatherLoad:()=>{try{return host.store.worldSetting('environment');}catch{return null;}},
  weatherSave:(request:Row)=>{
   const value=request.value;
   if(!host.store.writable||!value||typeof value!=='object'||Array.isArray(value))throw new WorldletError('Could not save weather settings.');
   const data=JSON.stringify(value);
   if(Buffer.byteLength(data)>=30_000)throw new WorldletError('Weather settings exceed the size limit.');
   host.store.saveWorldSetting('environment',value as Row);
   host.optional<WorldToolsService>(WORLD_TOOLS)?.observeWeather(value);
   return {ok:true};
  },
  weatherRequest:(request:Row)=>{
   if(typeof request.operation!=='string'||!request.params||typeof request.params!=='object'||Array.isArray(request.params))throw new WorldletError('Invalid weather request.');
   return weatherRequest(request.operation,request.params);
  },
  weatherLocate:()=>weatherLocate(surface)
 };
}
