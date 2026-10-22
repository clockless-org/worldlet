/** Illustrative weather for the sample world only. Never merge these values into a personal forecast. */
export function sampleWeatherForecast(now=Date.now()){
 const date=new Date(now);date.setUTCHours(12,0,0,0);
 return {placeName:'Demo location',timezone:'UTC',temperature:12,code:3,wind:14,hasLocation:true,forecast:[12,13,11,12,14,13,12].map((high,i)=>({
  time:+date+i*86400000,high,low:[7,8,6,7,8,7,6][i],code:[3,2,61,3,2,61,3][i],rain:[30,15,80,30,10,75,35][i],wind:[14,12,19,13,11,18,15][i],
  sunrise:Math.floor(+date/1000)+i*86400-6*3600,sunset:Math.floor(+date/1000)+i*86400+6*3600,
 }))};
}
