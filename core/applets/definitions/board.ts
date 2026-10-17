// The board (core/board/README.md): the numbers the person tracks, as tabs of blocks, each a saved Service read. The
// Applet only shows it: its panel reads the host action `board` (`read`), and an Agent or Fox sets it up. Nothing here
// reads an account itself, and no model is involved.
export default {
 id:'app-board',key:'board',title:'Board',region:'work',version:1,
 description:'The numbers you track from GitHub, PostHog and Cloudflare, on one board: a north-star number, a funnel, a list and a trend.',
 purpose:'See the numbers you track in one place',
 fullView:{kind:'panel'},scene:{template:'device',color:'#8a5a36',renderer:'painted-device',version:1},
 connection:{kind:'none',provider:null,capability:'local'},
 // Added from the Work area like GitHub, PostHog and Cloudflare: a new World has no board to show.
 installByDefault:false
};
