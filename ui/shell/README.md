# Application composition

Application-wide startup, media, content composition and sample entry points. The UI composition root is `ui/index.ts`. Fox lives in `ui/companion/`, controls in `ui/components/`, the renderer in `ui/world/`, and host communication in `platform/bridge/`.

`npm run build:native-ui` emits the existing `dist/WorldletWeb/` resources. Source moves do not change installed resource names or user data.
