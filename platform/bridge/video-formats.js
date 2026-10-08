// Installed at document start in every CEF website page's main world (engine/page.ts) to notice a
// page whose video needs H.264/AAC, which the standard CEF build lacks (#1174,
// core/browser/video-formats.ts decides). It only counts: proprietary formats the page was told are
// missing, video it set up or played, and media that failed for want of a playable stream. Every
// answer the page gets is the engine's own; it reads no content and sends nothing. The host reads
// the counts with __worldletVideoFormats(). The build writes it to WorldletWeb/browser/video-formats.js;
// engine/page.ts calls it with PROPRIETARY_VIDEO's source.
export function installVideoFormatWatch(pattern) {
  if (globalThis.__worldletVideoFormats) return;
  const proprietary = new RegExp(pattern, 'i');
  let refused = 0, played = 0, unsupported = 0, firstRefusal = -1;
  const refuse = type => {
    if (!proprietary.test(String(type ?? ''))) return;
    refused++;
    if (firstRefusal < 0) firstRefusal = performance.now();
  };
  // A Proxy keeps the function's name, length and native behaviour; `after` sees each answer.
  const watch = (owner, name, after) => {
    const original = owner?.[name];
    if (typeof original !== 'function') return;
    try {
      owner[name] = new Proxy(original, {apply(target, self, args) {
        let result;
        try { result = Reflect.apply(target, self, args); } catch (error) { try { after(undefined, args, error); } catch {} throw error; }
        try { after(result, args, null); } catch {}
        return result;
      }});
    } catch {}
  };
  const supported = (result, [type]) => { if (result === false) refuse(type); };
  watch(globalThis.MediaSource, 'isTypeSupported', supported);
  watch(globalThis.ManagedMediaSource, 'isTypeSupported', supported);
  watch(globalThis.HTMLMediaElement?.prototype, 'canPlayType', (result, [type]) => { if (result === '') refuse(type); });
  // A video stream the page set up means it found a format the engine plays.
  watch(globalThis.MediaSource?.prototype, 'addSourceBuffer', (result, [type], error) => {
    if (error) refuse(type);
    else if (/^\s*video\//i.test(String(type ?? ''))) played++;
  });
  watch(globalThis.navigator?.mediaCapabilities, 'decodingInfo', (result, [config]) => {
    Promise.resolve(result).then(info => { if (info && info.supported === false) refuse(config?.video?.contentType ?? config?.audio?.contentType); }, () => {});
  });
  addEventListener('playing', event => { if (event.target instanceof HTMLVideoElement) played++; }, true);
  // Only a video counts: a game's music or a sound effect that fails to load (Pokémon Showdown) is no reason to move the
  // page, and moving it left its sign-in behind in the other view's cookies (owner report 2026-10-07).
  addEventListener('error', event => {
    const media = event.target;
    if (!(media instanceof HTMLVideoElement) || media.error?.code !== 4) return;
    if (/NO_SUPPORTED_STREAMS|DECODER_ERROR_NOT_SUPPORTED/.test(media.error.message || '')) unsupported++;
  }, true);
  Object.defineProperty(globalThis, '__worldletVideoFormats', {value: () => {
    // A video at least 200 px wide and an eighth of the page: what a person watches, not a preview.
    const bigVideo = [...document.querySelectorAll('video')].some(video => {
      const r = video.getBoundingClientRect();
      return r.width >= 200 && r.width * r.height >= innerWidth * innerHeight / 8;
    });
    return {refused, played, unsupported, waited: firstRefusal < 0 ? 0 : Math.round(performance.now() - firstRefusal), bigVideo};
  }});
}
