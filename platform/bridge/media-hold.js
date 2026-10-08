// Injected into a website page when the Browser panel keeps or resumes it (Mac: the page's
// isolated world). Media the site starts stays paused until the person interacts with the
// page, so a kept or restored page never plays sound by itself; after the first trusted
// pointer, key or wheel input the site behaves normally again. The build writes it to
// WorldletWeb/browser/media-hold.js; see platform/browser/INTEGRATION.md.
export function holdMedia() {
  if (!globalThis.__worldletMediaHold) {
    const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    const hold = event => {
      if (event.target instanceof HTMLMediaElement) try { event.target.pause(); } catch {}
    };
    const release = event => {
      if (!event.isTrusted) return;
      globalThis.__worldletMediaHold = null;
      document.removeEventListener('play', hold, true);
      for (const input of inputs) document.removeEventListener(input, release, true);
    };
    globalThis.__worldletMediaHold = true;
    // Media events do not bubble; a capturing listener still sees every element's play.
    document.addEventListener('play', hold, true);
    for (const input of inputs) document.addEventListener(input, release, true);
  }
  for (const media of document.querySelectorAll('video,audio')) try { media.pause(); } catch {}
  return true;
}
