import {Observer,Equator,Horizon,Illumination,MoonPhase} from 'astronomy-engine';

// Topocentric Sun and Moon for the HUD and the Weather Applet.
// Azimuth is clockwise from true north; altitude is degrees above the local horizon.
let cachedKey='',cached;
let phaseKey=-1,phaseCache;
export function lunarPhaseAt(now:number){
 const key=Math.floor(now/60000);if(key===phaseKey)return phaseCache;
 const date=new Date(now),phase=MoonPhase(date)/360;
 const phaseName=['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'][Math.floor((phase+.0625)*8)%8];
 phaseKey=key;phaseCache={phase,phaseName,fraction:Illumination('Moon' as any,date).phase_fraction};return phaseCache;
}

// Project the Sun onto the Moon's local sky tangent plane: right follows
// increasing azimuth, up follows altitude. This includes the observer's tilt
// without a northern-hemisphere assumption (radians, clockwise from right).
export function lunarLightAngle(solar:{altitude:number;azimuth:number},lunar:{altitude:number;azimuth:number}){
 const rad=Math.PI/180,s=solar.altitude*rad,m=lunar.altitude*rad,d=(solar.azimuth-lunar.azimuth)*rad;
 return Math.atan2(-(Math.sin(s)*Math.cos(m)-Math.cos(s)*Math.sin(m)*Math.cos(d)),Math.cos(s)*Math.sin(d));
}
export function celestialAt(now,place) {
 const key=[Math.floor(now/1000),place.latitude,place.longitude].join(':');
 if(key===cachedKey)return cached;
 const date=new Date(now),observer=new Observer(place.latitude,place.longitude,0);
 const body=name=>{const equ=Equator(name,date,observer,true,true),h=Horizon(date,observer,equ.ra,equ.dec,'normal');return {altitude:h.altitude,azimuth:h.azimuth};};
 const solar=body('Sun'),lunar=body('Moon');
 cachedKey=key;cached={solar,lunar:{...lunar,...lunarPhaseAt(now),lightAngle:lunarLightAngle(solar,lunar)}};return cached;
}
