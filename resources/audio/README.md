# Worldlet original ambient music

**Bridge at Dusk** is an original instrumental cue created for Worldlet, 48 seconds,
80 BPM, stereo, AAC 128 kb/s. Soft synthesized keys and sustained chords with
short stereo echoes. No sampled recordings, commercial tracks or external music
services are used. Source composition and synthesis are in
[`scripts/render-world-music.py`](../../scripts/render-world-music.py).

The circular mix carries decays across the loop boundary. Source PCM is normalized
to a -6 dBFS peak; Worldlet's default playback volume is 24%. The Mac native build
copies this asset into `World/audio/`. It is not part of the website preview.

Rebuild on macOS: `python3 scripts/render-world-music.py` (Python standard library
and Apple's `afconvert`; no synthesis runs during application playback).

## Village Air

`village-air.m4a` is an original procedural ambience with no third-party recordings or samples. Low-passed noise under slow envelopes forms a soft wind, leaf and stream texture, with sparse quiet bird phrases; a 58-second stereo AAC loop with a crossfaded tail. Village selects this backdrop while preserving mute and volume preferences. Launching the app does not start playback. Fox can choose another sound for that session. Rebuild with `python3 scripts/render-world-ambience.py`. No synthesis runs during playback.

## Theme ambience

A [Theme Pack](../themes/README.md) may select one ambience for its overview, Areas
and Applet rooms. Its presentation maps to an allowlisted packaged track in the
same native WorldAudio channel as Village Air, never to additional renderer loops.
The HUD names the actual selected track. Moving rooms preserves playback state,
volume and voice ducking; it cannot unmute or interrupt music or a podcast. A
sound explicitly chosen by the person or Fox stays selected for the session.
Automatic theme ambience suspends while its scene is hidden or inactive, then
resumes only if it was playing; an explicit rain or music selection is independent
of scenery visibility. Theme event sounds are short renderer cues governed by the
same ambience mute, volume and ducking state.

## CC0 field recordings

Ocean Shore, Soft Rain and Forest Air replace the earlier procedural placeholders
with actual field recordings. See [CC0-SOURCES.json](CC0-SOURCES.json) for author,
source, license, processing and SHA-256. Rebuild with
`python3 scripts/import-cc0-ambience.py`. This authoring tool checks the CC0 source
page, downloads a bounded HQ preview excerpt, crossfades and normalizes it, then
encodes stereo AAC. No runtime Freesound API calls or downloads are required.

## Legacy offline music

Worldlet permits one audible media source at a time. Starting ambience/white
noise pauses music, radio and podcasts; starting any music or podcast pauses
ambience. A switch cancels pending stream loads and pauses immediately rather
than overlapping fade-outs. Podcast bookmarks and local playheads survive;
stopping the chosen source does not automatically restart the previous one.
The native WorldAudio entry point enforces this for both HUD and Agent calls.

Quiet Workshop (96 BPM) and Morning Path (112 BPM) remain available alongside
Bridge at Dusk when offline music is explicitly requested. Rebuild using
`python3 scripts/render-world-music.py focus` / `brisk`. New style requests use
live Radio Browser stations; Worldlet no longer expands synthesized presets as
its primary music offering. Radio streams are not bundled or downloaded.
