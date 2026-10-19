# api: what the operations repository uses

The operations repository (website, its Worker and the release hosts' scripts) uses a little of this
repository: a few modules for the website and its checks, and some files the release hosts build
with. It reaches them only through this folder, never by another path, so this repository can move
and rename its folders without a change there ([#714](https://github.com/clockless-org/worldlet/issues/714)).

| File | What it gives | Runs in |
| --- | --- | --- |
| [world.ts](world.ts) | The sample World the website's demo draws | browser bundle |
| [download.ts](download.ts) | Release links and the visitor's system for the download pages | browser bundle |
| [games.ts](games.ts) | The games the website lets visitors play | browser bundle |
| [build.ts](build.ts) | Brand, tokens, themes, the World's layout, the Applet catalog, release versions and the World page's CSP for the website build | Node |
| [checks.ts](checks.ts) | Phone pairing, remote Agents, Agent reports, boards, update channels and setup, for the checks that test the website Worker against the app | Node |
| [release.ts](release.ts) | The release check, update acceptance and the Windows release manifest, for the release hosts | Node |
| [files.ts](files.ts) | The paths of the files the website and the release hosts read or bundle | Node |
| [types.d.ts](types.d.ts) | The app's ambient types, for type-checking code that imports this folder | `tsc` |

Rules:

- Moving or renaming something listed here means changing only this folder. `node scripts/api-check.ts`
  (in `npm run check:arch`) fails when a module here does not load or a path in `files.ts` does not exist.
- Nothing in this repository imports `api/`. The architecture check rejects it.
- Removing an export or a path is a change for the operations repository: land its change there first.
