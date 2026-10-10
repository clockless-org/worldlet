/** Freshness belongs to shared product policy; hosts only supply monotonic age and scope. */
export function modelStatusFresh(input:{ready:boolean;ageMs:number;sameScope:boolean}):boolean {
 return input.ready===true && input.sameScope===true && Number.isFinite(input.ageMs) && input.ageMs>=0 && input.ageMs<30_000;
}

/** These requests can change readiness or the private/setup scope returned with it. */
export function changesModelStatus(action:string,body:Record<string,unknown>):boolean {
 return ['restartFox','resetFox','setSampleEnabled'].includes(action)
  || action==='foxPreferences'&&typeof body.cloudConsent==='boolean';
}
