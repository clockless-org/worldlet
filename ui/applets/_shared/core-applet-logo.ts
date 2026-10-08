// Home's core Applets represent functions, independent of their current provider.
const symbols={
 mail:'<rect x="42" y="65" width="172" height="126" rx="18"/><path d="m48 76 80 62 80-62"/>',
 calendar:'<rect x="48" y="54" width="160" height="156" rx="18"/><path d="M48 98h160M86 40v30m84-30v30M83 133h18m36 0h18m-72 37h18m36 0h18"/>',
 notes:'<path d="M64 42h128a12 12 0 0 1 12 12v122l-38 38H64a12 12 0 0 1-12-12V54a12 12 0 0 1 12-12Z"/><path d="M166 214v-38h38M84 86h88m-88 36h88m-88 36h48"/>',
 reminders:'<path d="m46 70 12 12 24-28M110 72h96m-96 56h96m-96 56h96"/><circle cx="64" cy="128" r="12"/><circle cx="64" cy="184" r="12"/>',
 weather:'<path d="M84 170a40 40 0 0 1 4-79 54 54 0 0 1 102 12 34 34 0 0 1-8 67Z"/><path d="M96 200l-10 22m40-22-10 22m40-22-10 22"/>',
 browser:'<rect x="36" y="52" width="184" height="152" rx="18"/><path d="M36 96h184"/><circle cx="62" cy="74" r="7"/><circle cx="86" cy="74" r="7"/><circle cx="110" cy="74" r="7"/>',
 // The Games area's own games: no publisher, so a drawn symbol is their identity.
 tiles:'<rect x="46" y="46" width="72" height="72" rx="14"/><rect x="138" y="46" width="72" height="72" rx="14"/><rect x="46" y="138" width="72" height="72" rx="14"/><rect x="138" y="138" width="72" height="72" rx="14"/>',
 snake:'<path d="M46 196h76v-64H74V60h112v84h26"/><circle cx="206" cy="196" r="12"/>',
 mine:'<circle cx="128" cy="132" r="46"/><path d="M128 50v28m0 108v28M46 132h28m108 0h28M70 74l20 20m76 76 20 20M186 74l-20 20M90 170l-20 20"/>',
 grid:'<rect x="44" y="44" width="168" height="168" rx="14"/><path d="M100 44v168M156 44v168M44 100h168M44 156h168"/>',
 sprout:'<path d="M40 200h176M128 200v-70"/><path d="M128 140c-6-40-40-62-76-58 2 38 34 62 76 58Zm0-20c4-36 34-58 72-56-2 36-30 58-72 56Z"/>',
 page:'<rect x="58" y="40" width="140" height="176" rx="18"/><path d="M86 96l12 12 22-26M136 98h36M86 154l12 12 22-26M136 156h36"/>',
 threads:'<path d="M44 64h120a20 20 0 0 1 20 20v52a20 20 0 0 1-20 20H96l-32 28v-28H44a20 20 0 0 1-20-20V84a20 20 0 0 1 20-20Z"/><path d="M184 104h28a20 20 0 0 1 20 20v52a20 20 0 0 1-20 20h-12v24l-28-24h-36"/><path d="M64 104h80M64 128h52"/>',
 dice:'<rect x="48" y="48" width="160" height="160" rx="28"/><circle cx="92" cy="92" r="8"/><circle cx="128" cy="128" r="8"/><circle cx="164" cy="164" r="8"/><circle cx="164" cy="92" r="8"/><circle cx="92" cy="164" r="8"/>'
};
export function coreAppletSource(kind,stroke='#795c3e'){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><g fill="none" stroke="${stroke}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">${symbols[kind]}</g></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export const CORE_APPLET_KINDS={gmail:'mail','google-calendar':'calendar','apple-notes':'notes','apple-reminders':'reminders',weather:'weather',browser:'browser','game-2048':'tiles',snake:'snake',minesweeper:'mine',sudoku:'grid','random-game':'dice',garden:'sprout',widgets:'page',ongoing:'threads'};
