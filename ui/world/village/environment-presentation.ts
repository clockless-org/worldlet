// Aesthetic local-time fallback. It never supplies invented coordinates or
// changes the weather/astronomy authority returned by environmentAt().
export function environmentPresentation(state){
 if(state.positionMode==='location-calculated')return {solar:state.solar,lunar:state.lunar,mode:'location-calculated'};
 const day=(state.celestialDaylight??state.daylight)>.2,progress=Math.max(0,Math.min(1,state.progress??.5));
 return {
  mode:'decorative-local-time',
  solar:{altitude:day?15+45*Math.sin(progress*Math.PI):-30,azimuth:90+progress*180},
  lunar:{...state.lunar,altitude:day?-30:38,azimuth:125,fraction:state.lunar?.fraction??0,phase:state.lunar?.phase??0,phaseName:state.lunar?.phaseName||'Location needed'},
 };
}
