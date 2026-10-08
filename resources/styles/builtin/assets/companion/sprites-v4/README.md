# Fox walking sprite

`walking.png` and its frame table in `atlas.json` play the short walk on the startup
screen (`ui/shell/startup-walk.ts`); `scripts/build-native-ui.ts` copies the sheet to
`assets/fox-walking.png`. `sources.json` and `provenance.json` record how the sheet
was generated and registered.

The other v4 sheets and their renderer were removed once the Rive Fox shipped; they
are recoverable from Git history.
