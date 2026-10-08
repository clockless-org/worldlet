// Only registered in the isolated practice world.
export const practiceTools=[{
 name:'prepare_email',description:'Prepare a practice email for review, never send. Read the original records this turn and provide their sourceIds.',parameters:{type:'object',properties:{to:{type:'string',maxLength:254},subject:{type:'string',maxLength:300},body:{type:'string',minLength:1,maxLength:30000},threadId:{type:'string',maxLength:100},sourceIds:{type:'array',items:{type:'string'},maxItems:8}},required:['subject','body'],additionalProperties:false},
},{
 type:'function',name:'run_practice_iteration',description:'When asked to implement the last engineering/design meeting through Calendar, Notion, Codex and GitHub, run the isolated fictional iteration demonstration. Stay in the world. Creates local practice artifacts and shows their handoffs; no real CLI, remote Notion write or GitHub PR. Do not open individual Applets.',parameters:{type:'object',properties:{},additionalProperties:false},
},{
 type:'function',name:'practice_applet',description:'In the practice world, demonstrate an on-demand checklist Applet: create a functional local checklist from the requested title and items, show it, or put it away. This is a bounded checklist template, not arbitrary code generation or a public Applets Hub. Use only when requested.',parameters:{type:'object',properties:{action:{type:'string',enum:['create','show','hide']},title:{type:'string',maxLength:60},items:{type:'array',items:{type:'string',maxLength:100},maxItems:8}},required:['action'],additionalProperties:false},
},{
 type:'function',name:'customize_companion',description:'In the practice world, set the companion name and play an existing painted expression for the user. This changes the visible companion, not its avatar artwork or spoken voice. Use only when asked.',
 parameters:{type:'object',properties:{name:{type:'string',minLength:1,maxLength:24},expression:{type:'string',enum:['idle','happy','waving','sleeping']}},required:['name','expression'],additionalProperties:false},
}];
