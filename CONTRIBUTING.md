# Contributing to Worldlet

Thank you for helping. Start with the [README](README.md): it is the entry point to every guide, and each module's own document is the source of truth for that module.

## Set up

Requirements: Node.js 22.19 or later; macOS, Windows or Linux on x64 (Apple silicon is supported on Mac).

```sh
npm ci
npm run setup:hermes   # pinned Hermes runtime used by Fox when no other Agent is chosen
npm run dev            # development build with a watcher
```

No account, secret or hosted service is needed for a development build.

## Before you open a pull request

- Run `npm run check:pr` (types, architecture and contract boundaries, docs links, source layout and style). Pull request CI runs the same checks.
- Run the focused tests for what you changed; `npm run test` runs the shared rule tests.
- Repository documentation is English. When you change README.md, keep [README.zh.md](README.zh.md) in sync. A new Markdown file needs `node scripts/docs-check.ts --write-index` to refresh the README inventory.
- Keep each pull request to one change, and describe what a person would see before and after.

## License

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the license of this project.
