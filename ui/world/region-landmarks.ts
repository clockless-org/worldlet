// Landmarks retain their original composition; the Work furnace sits slightly farther back.
export const REGION_LANDMARKS:Record<string,{anchor:number[];width:number}>={
 home:{anchor:[.52,.512],width:157.5},library:{anchor:[.438,.377],width:130},
 money:{anchor:[.621,.376],width:81.25},health:{anchor:[.763,.49],width:152.5},
 work:{anchor:[.701,.642],width:127.5},travel:{anchor:[.308,.67],width:97.5}
};
export const LANDMARK_KEYS=Object.keys(REGION_LANDMARKS);
