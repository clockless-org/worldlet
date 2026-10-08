/** Local World presentation; unrelated to model/provider configuration. */
export type TextScale=1|1.25|1.5|2;
export interface PresentationHostBodies {
 saveOverlay:{state:Record<string,unknown>};
 saveSampleUI:{state:Record<string,string>};
 setTextScale:{value:TextScale};
}
export type PresentationRequest={[K in keyof PresentationHostBodies]:{action:K}&PresentationHostBodies[K]}[keyof PresentationHostBodies];
export function isPresentationAction(action:unknown):action is keyof PresentationHostBodies {
 return action==='saveOverlay'||action==='saveSampleUI'||action==='setTextScale';
}
