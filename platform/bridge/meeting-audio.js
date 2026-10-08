// Injected at document start into the main world of a Meetings page (Google Meet, Zoom, Teams) on
// the CEF engine, only while it is on one of those sites. It notes the call's audio as the site
// creates it: other participants (WebRTC tracks the page receives, and what it plays through Web
// Audio) and the person's own microphone (what the site asked getUserMedia for). Nothing is
// captured until the host starts it after the person chose to transcribe; then 16 kHz mono PCM16 of
// each side goes to the host through a binding whose random name only the host knows, about once a
// second, until the host stops it or the page leaves. Audio is never played, stored or sent
// anywhere else here. The build writes it to WorldletWeb/browser/meeting-audio.js.
export function installMeetingAudio(bindingName) {
  const send = globalThis[bindingName];
  try { delete globalThis[bindingName]; } catch {}
  const host = location.hostname.toLowerCase();
  const meeting = host === 'meet.google.com' || host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'teams.microsoft.com' || host === 'teams.live.com';
  if (typeof send !== 'function' || !meeting || globalThis.__worldletMeetingAudio) return;
  const RATE = 16000;
  const tracks = {others: new Set(), you: new Set()};
  const connect = AudioNode.prototype.connect;
  let state = null;
  const watch = (track, side) => {
    if (!track || track.kind !== 'audio' || tracks[side].has(track)) return;
    tracks[side].add(track);
    track.addEventListener('ended', () => { tracks[side].delete(track); detach(track); });
    if (state) attach(track, side);
  };
  // Other participants: every audio track a peer connection receives.
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    const Native = globalThis[name];
    if (typeof Native !== 'function') continue;
    globalThis[name] = new Proxy(Native, {construct(target, args, newTarget) {
      const pc = Reflect.construct(target, args, newTarget);
      try { pc.addEventListener('track', event => watch(event.track, 'others')); } catch {}
      return pc;
    }});
  }
  // Calls that decode audio themselves (Zoom's web client) play it through Web Audio: whatever
  // reaches a page context's speakers is also tapped. The capture's own context is left out.
  const taps = new WeakMap();
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = connect.call(this, destination, ...rest);
    try {
      if (destination instanceof AudioDestinationNode && (!state || this.context !== state.context)) {
        let tap = taps.get(this.context);
        if (!tap) { tap = this.context.createMediaStreamDestination(); taps.set(this.context, tap); for (const track of tap.stream.getAudioTracks()) watch(track, 'others'); }
        connect.call(this, tap);
      }
    } catch {}
    return result;
  };
  // The person: the microphone the site opened.
  const devices = globalThis.MediaDevices?.prototype;
  if (devices?.getUserMedia) {
    const getUserMedia = devices.getUserMedia;
    devices.getUserMedia = function (...args) {
      return getUserMedia.apply(this, args).then(stream => {
        try { for (const track of stream.getAudioTracks()) watch(track, 'you'); } catch {}
        return stream;
      });
    };
  }

  function attach(track, side) {
    if (!state || state.sources.has(track) || track.readyState === 'ended') return;
    try {
      const source = state.context.createMediaStreamSource(new MediaStream([track]));
      connect.call(source, state.sides[side].input);
      state.sources.set(track, source);
    } catch {}
  }
  function detach(track) {
    const source = state?.sources.get(track);
    if (!source) return;
    try { source.disconnect(); } catch {}
    state.sources.delete(track);
  }
  const encode = samples => {
    const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  function flush(side) {
    const part = state?.sides[side];
    if (!part || !part.length) return;
    const samples = new Float32Array(part.length);
    let at = 0;
    for (const chunk of part.chunks) { samples.set(chunk, at); at += chunk.length; }
    part.chunks = []; part.length = 0;
    try { send(JSON.stringify({side, rate: RATE, pcm: encode(samples)})); } catch {}
  }
  function start() {
    if (state) return true;
    const context = new AudioContext({sampleRate: RATE});
    const silent = context.createGain();
    silent.gain.value = 0;
    connect.call(silent, context.destination);
    state = {context, sources: new Map(), sides: {}};
    for (const side of ['others', 'you']) {
      const input = context.createGain(), processor = context.createScriptProcessor(4096, 1, 1);
      const part = {input, processor, chunks: [], length: 0};
      processor.onaudioprocess = event => {
        part.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        part.length += event.inputBuffer.length;
        if (part.length >= RATE) flush(side);
      };
      connect.call(input, processor);
      connect.call(processor, silent);
      state.sides[side] = part;
    }
    for (const side of ['others', 'you']) for (const track of tracks[side]) attach(track, side);
    context.resume().catch(() => {});
    return true;
  }
  function stop() {
    if (!state) return false;
    flush('others'); flush('you');
    for (const track of [...state.sources.keys()]) detach(track);
    const context = state.context;
    state = null;
    context.close().catch(() => {});
    return true;
  }
  Object.defineProperty(globalThis, '__worldletMeetingAudio', {value: Object.freeze({
    start,
    stop,
    status: () => ({capturing: !!state, others: tracks.others.size, you: tracks.you.size, running: state?.context.state === 'running'})
  })});
  addEventListener('pagehide', stop);
}
