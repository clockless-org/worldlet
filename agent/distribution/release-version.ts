/** Native/npm versions have numeric components; public versions pad MMDD. */
export function calendarParts(version:string){
 const parts=/^(\d{4})\.(\d{1,4})\.(\d+)$/.exec(version||'');
 if(!parts)return null;
 const year=Number(parts[1]),middle=Number(parts[2]),last=Number(parts[3]);
 const month=middle>12?Math.floor(middle/100):middle,day=middle>12?middle%100:last;
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<2026||date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return null;
 return {year,month,day,build:middle>12?last:null};
}
export function displayReleaseVersion(version:string,build?:number|string):string {
 const date=calendarParts(version);if(!date)return version;
 const number=build===undefined?date.build:Number(build);
 if(!Number.isSafeInteger(number)||Number(number)<1)return `${date.year}.${String(date.month).padStart(2,'0')}.${String(date.day).padStart(2,'0')}`;
 return `${date.year}.${String(date.month).padStart(2,'0')}${String(date.day).padStart(2,'0')}.${number}`;
}
export function nativeReleaseVersion(version:string,build:number):string {
 const date=calendarParts(version);
 if(!date||!Number.isSafeInteger(build)||build<1)throw Error('Invalid calendar release identity');
 return `${date.year}.${date.month*100+date.day}.${build}`;
}
/** Historical archives remain immutable and discoverable. */
export function releaseTag(version:string,build:number,platform='mac'):string {
 const date=calendarParts(version);
 return (platform==='windows'?'windows-':'')+(date&&date.build===build?`v${displayReleaseVersion(version,build)}`:`v${version}-b${build}`);
}
