# Working in this repository

Read [README.md](README.md) first and follow it. Documentation is English; [README.zh.md](README.zh.md) is the Chinese copy of the README and changes with it in the same pull request.

This repository is public. Everything committed here, in any branch, commit message, pull request, issue or review comment, can be read by anyone and stays in history after it is deleted.

## Keep private information out

Never commit, paste or quote any of these:

- Secrets: API keys, tokens, passwords, private keys, certificates, `.env` files, keychain or signing exports. A key that is public by design (for example a Firebase client key that ships in every app) is marked with a `public-safety: allow` comment that says why.
- Personal data: real people's email addresses, phone numbers, names, messages, calendars, contacts, screenshots of real accounts, crash reports or analytics rows that identify a person.
- Machines and networks: private IP addresses, host names of personal or release machines, SSH users and keys, absolute paths under someone's home folder (`/Users/<name>`, `C:\Users\<name>`).
- Internal services: admin or operations hosts, dashboards, database and project ids, internal Worker names, links to private repositories, issues or chats.
- Release and signing setup that is not already public: where keys live, notarization profiles, store and payment accounts.
- Private conversations: chat logs, meeting notes, decision threads or quotes from them. Write the decision itself, in your own words, where the code needs it.

Use placeholders instead: `alex@example.com`, `example.com`, `192.0.2.10` (or `192.168.1.x` for a home router), `/Users/alex`, `Alex` and `Sam` for people, `YOUR_API_KEY` for keys.

`npm run check:public` (part of `npm run check:pr` and of pull request CI) fails on secrets, private addresses, personal home folders and a list of known private names. It cannot catch everything: you are still responsible for what you commit. If you find private information already in the repository, remove it in a pull request and tell a maintainer, because it also needs to be rotated or scrubbed from history.

## Architecture

- Follow [the UI/Core/Platform standard](docs/UI-CORE-PLATFORM.md): shared Web UI, pure Core decisions, native IO adapters; the trusted World and external sites are separate Chromium surfaces. CDP never substitutes for authorization or ordinary component interfaces.
- Preserve five runtime layers: UI → Core → Platform → Harness → Models/Services. `contracts/` is a cross-layer interface package, not a sixth layer.
- Worldlet's scope is the upper three layers. Put most product behavior in shared `ui/` and pure `core/`; keep native Platform adapters thin (few independent product decisions). Harness and model concerns belong to the Harness.
- Before adding native branching, state transitions, schedules, retry or cache policy, validation, prompts or status copy, look for a shared owner. Native code supplies OS facts and permission results, executes shared decisions and performs browser, process and file IO.
- For audits and cross-platform changes, use [the architecture audit checklist](docs/UI-CORE-PLATFORM.md#architecture-audit) and report concrete file evidence. Passing import checks is not proof of behavioral parity.

## Changes and pull requests

- Keep each pull request to one change. Run `npm run check:pr` and `npm test` before pushing, and `npm run test:ui:quick` when the change touches the interface; pull request CI runs the same checks and the fastest UI checks (`test:ui:pr`) on Linux and should finish within about five minutes.
- Update the documentation a change affects in the same pull request (`npm run check:docs` checks links and the inventory in [docs/README.md](docs/README.md)).
- Describe the change in plain language: what a reader sees before and after, and how it works.
