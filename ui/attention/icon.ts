// One game-style marker per kind, shared by the Attention Center and the world markers.
// Shapes communicate kind only; row backgrounds communicate attention level.
const SHAPES={
 event:'<path d="M12 2.6 21.4 12 12 21.4 2.6 12Z"/>',
 needsAction:'<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.6"/>',
 unseen:'<circle cx="12" cy="12" r="9"/>'
};
export function attentionIcon(state,requiresChoice=false,priority='normal'){
 const frame=SHAPES[state]||SHAPES.unseen;
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+frame+'</svg>';
}
