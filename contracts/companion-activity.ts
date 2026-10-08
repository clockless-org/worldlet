/** Presentation-only foreground phases. Never permissions or proof of success. */
export const FOX_FOREGROUND_ACTIVITIES=['thinking','reading','searching','comparing','planning','drafting','calculating','organizing','creating','working','checking','awaiting_user','awaiting_service'] as const;
export type FoxForegroundActivity=typeof FOX_FOREGROUND_ACTIVITIES[number];
export type FoxActivitySignal={activity:FoxForegroundActivity;source:'tool'|'stage';tool?:string};
export function isFoxForegroundActivity(value:unknown):value is FoxForegroundActivity{return typeof value==='string'&&(FOX_FOREGROUND_ACTIVITIES as readonly string[]).includes(value);}
