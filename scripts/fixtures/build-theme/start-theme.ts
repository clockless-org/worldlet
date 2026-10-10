// The fixture renders theme packages' own Applet scenes, so it starts in Village Map rather than the Village.
// Imported first, so the saved choice is in place before the theme registry reads it.
try{localStorage.setItem('worldlet-theme-v2','village-map');}catch{}
