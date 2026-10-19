/** Strict function-tool schema: every listed property is required. */
export const tool=(name:string,description:string,properties:Record<string,unknown>={})=>({type:'function',name,description,strict:true,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}});
export const string=(description:string)=>({type:'string',description});
