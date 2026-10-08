// Row-major frames in resources/styles/builtin/assets/companion/expressions/atlas.png.
export const FOX_FRAMES = {
 idle:0, blink:1, talking:2, thinking:3, listening:4, happy:5,
 surprised:6, confused:7, concerned:8, satisfied:9, drowsy:10,
 yawning:11, sleeping:12, sleepingBreath:13, stretching:14, waving:15,
} as const;

export const FOX_IDLE_TIMING={drowsy:840_000,yawn:897_000,sleep:900_000,wake:2600} as const;
// Active work always wins over inactivity; provider choice is not an emotion.
export function companionPose(state:string,idleFor:number,waking=false){
 if(state==='writing')return 'listening';
 if(state!=='idle'&&state!=='local')return state;
 if(waking)return 'stretching';
 if(idleFor>=FOX_IDLE_TIMING.sleep)return 'sleeping';
 if(idleFor>=FOX_IDLE_TIMING.yawn)return 'yawning';
 if(idleFor>=FOX_IDLE_TIMING.drowsy)return 'drowsy';
 return 'idle';
}

export function companionFrame(state:string,elapsed:number,reduced=false){
 const thoughtful=['thinking','working','transcribing','preparing'].includes(state);
 if(thoughtful)return FOX_FRAMES.thinking;
 if(state==='talking')return reduced?0:Math.floor(elapsed/190)%2?2:0;
 if(state==='sleeping')return reduced?12:Math.floor(elapsed/1800)%2?13:12;
 if(state in FOX_FRAMES && state!=='idle')return FOX_FRAMES[state as keyof typeof FOX_FRAMES];
 return !reduced&&elapsed%4600>4440?1:0;
}

// Whole-pose animation, not an independent ear/paw rig. Keep amplitudes small
// so the painted character retains its contact point and readable expression.
export function companionMotion(state:string,elapsed:number,reduced=false){
 if(reduced)return {angle:0,lift:0,breath:0};
 const profiles:Record<string,number[]>={
  idle:[4200,.004,0,.012],blink:[4200,.004,0,.012],talking:[1100,.009,1,.008],
  thinking:[3600,.024,0,.009],working:[3600,.024,0,.009],preparing:[3600,.024,0,.009],transcribing:[3600,.024,0,.009],
  listening:[3000,.019,0,.012],happy:[1600,.014,3,.009],surprised:[1800,.007,1,.014],
  confused:[3400,.03,0,.009],concerned:[4000,.012,0,.01],satisfied:[3600,.012,0,.012],
  drowsy:[4800,.017,0,.016],yawning:[3000,.012,0,.025],sleeping:[3600,0,0,.018],
  sleepingBreath:[3600,0,0,.018],stretching:[2600,.008,0,.026],waving:[1800,.025,1,.009],
 };
 const [period,angle,lift,breath]=profiles[state]||profiles.idle;
 const phase=elapsed/period*Math.PI*2;
 return {angle:Math.sin(phase)*angle,lift:(1-Math.cos(phase))*lift/2,breath:(1-Math.cos(phase))*breath/2};
}
