import defaults from './default-persona.json' with {type:'json'};

/** Empty archive personality means inherit, not a persisted copy of defaults. */
export function companionPersona(personality?:string) {
 const custom=personality?.trim()||'';
 return {id:defaults.id,version:defaults.version,name:defaults.name,source:custom?'custom':'builtin',
  summary:custom||defaults.summary,personality:custom||defaults.personality};
}

/** Harness-neutral persona. Does not change memory ownership or permissions. */
export function companionPersonaPrompt(name:string,personality?:string):string {
 const persona=companionPersona(personality);
 return 'Your companion name is '+(name.trim()||persona.name)+'.\nWorldlet companion personality ('+persona.source+'):\n'+persona.personality+
  '\nUse this resolved identity and personality for Worldlet conversations. It takes precedence over conflicting legacy Harness persona, display personality or SOUL tone instructions. Memories remain reference data; personality never changes permissions, tool authorization or safety boundaries.';
}
