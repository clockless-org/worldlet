const paths: Record<string,string>={file:'<path d="M14 2H6v20h12V6zM14 2v5h4M9 12h6M9 16h6"/>',book:'<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m2 3h3"/>',alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',chat:'<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/>',phone:'<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',spark:'<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',settings:'<path d="M9.8 3h4.4l.6 2.3 2 .9 2.1-.7 2.2 3.8-1.5 1.6v2.2l1.5 1.6-2.2 3.8-2.1-.7-2 .9-.6 2.3H9.8l-.6-2.3-2-.9-2.1.7-2.2-3.8 1.5-1.6v-2.2L2.9 9.5l2.2-3.8 2.1.7 2-.9z"/><circle cx="12" cy="12" r="3"/>'};
paths.download='<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>';
paths.back='<path d="m14 5-7 7 7 7"/>';
paths.forward='<path d="m10 5 7 7-7 7"/>';
paths.home='<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/>';
paths.companion='<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m4-11h4m-4 6h4"/>';
paths.keyboard='<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>';
paths.bug='<path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/><rect x="7" y="7.5" width="10" height="13" rx="5"/><path d="M12 11v9.5M3 13h4m10 0h4M4.5 8l2.7 1.8m12.3-1.8-2.7 1.8M4.5 19.5l2.8-2m12.2 2-2.8-2"/>';
paths.microphone='<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>';
paths.map='<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>';
paths.reply='<path d="M9 15 4 10l5-5"/><path d="M4 10h10a6 6 0 0 1 6 6v3"/>';
paths.bulb='<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>';
// A page becoming an Applet: a window with a plus on its corner.
paths.makeApplet='<rect x="3" y="4" width="14" height="13" rx="2.5"/><path d="M3 8h14M19 14v6m-3-3h6"/>';
paths.compare='<path d="M8 4v16m8-16v16M3 8l5-4 5 4m-2 8 5 4 5-4"/>';
export const uiIcon=name=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.file}</svg>`;

paths.project='<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M3 11h18m-12 0v3h6v-3"/>';
paths.coins='<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6"/>';
paths.heart='<path d="M12 21S2 15 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 13-10 13Z"/>';
paths.people='<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m2 11v-3a6 6 0 0 0-2-4"/>';

paths.lock='<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>';
paths.plug='<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zm6 9v4"/>';
paths.link='<path d="m9 15 6-6M9 8l2-2a5 5 0 0 1 7 7l-2 2M8 9l-2 2a5 5 0 0 0 7 7l2-2"/>';
paths.focus='<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8 10h8M8 14h5"/>';
// Closing a tab (the Browser's tab strip).
paths.close='<path d="M7 7l10 10M17 7 7 17"/>';
paths.refresh='<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>';
paths.terminal='<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>';
paths.compass='<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>';

// Wide-set strokes: the tighter three-line wind glyph turns to mush at 18px.
paths.breeze='<path d="M3 7h10.5a3.4 3.4 0 1 0-3.4-3.4"/><path d="M3 12.5h13a3.6 3.6 0 1 1-3.6 3.6"/><path d="M3 18h7"/>';
paths.note='<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>';

// The sound you are actually hearing wears its own face: waves, rain, trees,
// open air, a note for music and a microphone for a spoken programme.
paths.wave='<path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>';
paths.drop='<path d="M12 3s6 6.7 6 10.5a6 6 0 0 1-12 0C6 9.7 12 3 12 3Z"/>';
paths.tree='<path d="M12 3 5 12h4l-4 5h14l-4-5h4L12 3ZM12 17v4"/>';
paths.mic='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-3 0h6"/>';
paths.dice='<g transform="rotate(-12 12 12)"><rect x="4" y="4" width="16" height="16" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.3"/><circle cx="16" cy="8" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="8" cy="16" r="1.3"/><circle cx="16" cy="16" r="1.3"/></g></g>';

paths.play='<path d="m8 4 12 8-12 8z"/>';
paths.pause='<path d="M8 4v16M16 4v16"/>';
// Picture in picture: a screen with the small window filled in its lower right.
paths.pip='<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><rect x="12" y="11.5" width="7" height="5.5" rx="1.2" fill="currentColor" stroke="none"/>';
// Resize from a corner: two short strokes across the corner, not arrows that read as full screen.
paths.cornerGrip='<path d="M5 13 13 5M5 19 19 5"/>';

paths.clock='<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
// Fox's energy: a charging bolt.
paths.bolt='<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>';
paths.skip='<path d="m5 5 8 7-8 7zM18 5v14"/>';

paths.flame='<path d="M13 2c1 5-5 5-3 9 2 0 3-2 3-4 4 3 6 6 5 9a6 6 0 0 1-12 0c-1-4 1-7 4-9-1 3 0 4 0 4"/>';
