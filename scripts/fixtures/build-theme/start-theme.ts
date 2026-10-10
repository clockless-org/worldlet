// The fixture renders theme packages, so it starts in Village Map rather than the built-in Village World.
// Imported first, so the saved choice is in place before the theme registry reads it.
try{localStorage.setItem('worldlet-theme-v2','village-map');}catch{}
