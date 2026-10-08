/** World menu enablement (Mac `CommandMenu("World")`). Hosts supply facts; every host applies the same rules as the World UI. */
export interface WorldMenuFacts {writable:boolean;sample:boolean;busy:boolean;organizing:boolean;cloudConsent:boolean;sources:number;connections:number}
export interface WorldMenuState {importFiles:boolean;generate:boolean;readConnectedApps:boolean}
export function worldMenuState(facts:Partial<WorldMenuFacts>):WorldMenuState {
 // A personal world that is not in the middle of another task.
 const personal=facts.writable===true&&facts.sample!==true&&facts.busy!==true&&facts.organizing!==true;
 // Generating and reading connected apps send selected private context to the connected model.
 const allowed=personal&&facts.cloudConsent===true;
 return {importFiles:personal,generate:allowed&&Number(facts.sources)>0,readConnectedApps:allowed&&Number(facts.connections)>0};
}
