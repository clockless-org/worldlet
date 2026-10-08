// Trusted, authored Applets/templates add modules here (or import their module).
// Bundling generates the identical catalog for both harnesses. This is not a
// mechanism for executing arbitrary downloaded templates or model-authored code.
export type WorldModule={target:string;actions:{action:string;name:string;description:string;parameters:any}[]};
export const worldModules:WorldModule[]=[];
