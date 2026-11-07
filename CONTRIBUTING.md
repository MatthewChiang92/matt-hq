# Contributing to Matt HQ

## Run it from source

Needs Node.js 20+ and pnpm 10 or 11 (`corepack enable` gets you pnpm).

```bash
git clone https://github.com/MatthewChiang92/matt-hq && cd matt-hq
pnpm install
pnpm dev                                   # the UI with fake data, no agents
pnpm dev:hq                                # the real HQ server + UI, with hot reload
```

`pnpm dev` is a demo with fake data: nothing runs and nothing leaves the browser. To test a change for real, use `pnpm dev:hq` or `pnpm hq` against a throwaway repo.

| Command | Does |
| --- | --- |
| `pnpm dev` | Demo UI with fake data at http://localhost:5173 |
| `pnpm dev:hq` | Real HQ server + UI with hot reload (`HQ_REPO=<path>` also adds a project) |
| `pnpm hq` | Builds the UI, then runs HQ like a release (`--repo <path>` adds a project, `--port 7420`) |
| `pnpm build` | Type-checks, builds the UI to `dist/` and the server to `dist-server/` |
| `pnpm typecheck` | Type-check only |
| `npm pack` | Builds the tarball the CI smoke test installs |

Start HQ with `HQ_DEBUG=1` to log why a queued message is waiting.

## Where things are

```
src/
  data/      Types, the OfficeDataSource interface, fake (data/mock) and real (data/ws) data
  store/     Zustand stores; the only code that talks to the data source
  office/    The PixiJS pixel office: layout, sprites, agents, belt
  ui/        Top bar, team panel, activity, drawers, settings, setup checklist, welcome
server/      Local HQ server: setup checks, workspaces, sessions (tmux, or HQ-run on Windows), sbx, hooks, Team MCP, GitHub
bin/         The matt-hq command
docs/        User guides, and the product spec (matthq-context.md)
context/     Implementation plans
```

## Docker Sandboxes versions

HQ calls the `sbx` CLI and reads its output. sbx 0.48 changed several outputs (for example `sbx ls --json` and `sbx mcp ls --json` now return a bare array), so read sbx output in a way that accepts both the old and the new format. HQ is tested on sbx 0.47 and 0.50.

## Releasing

Matt HQ isn't published to npm (`private` in `package.json`). Run it from source; see the README.
