// Injected into a website page for picture in picture (core/browser/picture-in-picture.ts; Mac:
// the page's isolated world). Cosmetic only: it reads no content, sends nothing and has no host
// bridge. 'probe' says whether the page plays a video big enough to be what the person watches;
// 'enter' marks that video and adds a style that makes it fill the page's viewport over
// everything else, and moves the mark when another video takes over; 'leave' removes all of it.
// Videos inside frames or shadow roots are not found, so such pages are not offered. The build
// writes it to WorldletWeb/browser/picture-in-picture.js.
export function pictureInPicture(mode) {
  const WINDOW = 'data-worldlet-pip-window', VIDEO = 'data-worldlet-pip-video', PATH = 'data-worldlet-pip-path';
  const playing = video => !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0;
  const size = video => { const r = video.getBoundingClientRect(); return r.width * r.height; };
  const biggest = videos => videos.sort((a, b) => size(b) - size(a))[0] || null;
  const videos = [...document.querySelectorAll('video')];
  if (mode === 'probe') {
    // A preview or a thumbnail is not what the person watches: at least 200 px wide and an eighth of the page.
    const video = biggest(videos.filter(playing));
    return !!video && video.getBoundingClientRect().width >= 200 && size(video) >= innerWidth * innerHeight / 8 && getComputedStyle(video).visibility !== 'hidden';
  }
  const marked = () => document.querySelector(`video[${VIDEO}]`);
  const unmark = () => {
    for (const node of document.querySelectorAll(`[${VIDEO}],[${PATH}]`)) { node.removeAttribute(VIDEO); node.removeAttribute(PATH); }
  };
  const mark = video => {
    if (!video || video.hasAttribute(VIDEO)) return;
    unmark();
    video.setAttribute(VIDEO, '');
    for (let node = video.parentElement; node; node = node.parentElement) node.setAttribute(PATH, '');
  };
  if (mode === 'leave') {
    globalThis.__worldletPip?.abort();
    globalThis.__worldletPip = null;
    unmark();
    document.documentElement.removeAttribute(WINDOW);
    const sheet = globalThis.__worldletPipStyle;
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(adopted => adopted !== sheet);
    return true;
  }
  if (mode !== 'enter') return false;
  // With nothing playing, the biggest video still shows rather than an empty window.
  mark(marked() || biggest(videos.filter(playing)) || biggest(videos));
  document.documentElement.setAttribute(WINDOW, '');
  // A constructed sheet: a page's style-src policy blocks an added <style> element, not this.
  const sheet = globalThis.__worldletPipStyle ||= new CSSStyleSheet();
  if (!document.adoptedStyleSheets.includes(sheet)) {
    // Ancestors lose what would make them the video's containing block or clip it; their own
    // pseudo-elements and every other element are hidden, so the video paints on top.
    sheet.replaceSync(`
html[${WINDOW}],html[${WINDOW}] body{overflow:hidden!important;background:#000!important}
html[${WINDOW}] body :not([${PATH}]):not([${VIDEO}]){visibility:hidden!important}
html[${WINDOW}] [${PATH}]{visibility:visible!important;opacity:1!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;filter:none!important;backdrop-filter:none!important;perspective:none!important;contain:none!important;will-change:auto!important;clip-path:none!important;mask:none!important}
html[${WINDOW}] [${PATH}]::before,html[${WINDOW}] [${PATH}]::after{display:none!important}
html[${WINDOW}] video[${VIDEO}]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;transform:none!important;object-fit:contain!important;background:#000!important;visibility:visible!important;opacity:1!important;display:block!important;z-index:2147483647!important}`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  if (!globalThis.__worldletPip) {
    const listening = new AbortController();
    // Media events do not bubble; a capturing listener sees every video start. The mark moves
    // only when the marked video is gone or stopped, so a background preview cannot take over.
    document.addEventListener('playing', event => {
      const current = marked();
      if (event.target instanceof HTMLVideoElement && (!current || current.paused || current.ended)) mark(event.target);
    }, {capture: true, signal: listening.signal});
    globalThis.__worldletPip = listening;
  }
  return !!marked();
}
