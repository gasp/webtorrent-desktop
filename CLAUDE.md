# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Maintenance mission**: this is a personally-maintained fork — upstream is unmaintained (last release 2020).
The multi-week modernization roadmap, current status, and open decisions live in `MODERNIZATION.md`.
Consult it before starting work; update its checkboxes and decision log as work lands.

## Commands

```bash
pnpm start                  # Build, then launch the app (electron --no-sandbox .)
pnpm run watch              # Auto-restart the app on js/css changes (nodemon)
pnpm run build              # esbuild: transpile src/ → build/, bundle the UI renderer (bin/build.js)
pnpm test                   # Lint only: standard (JS Standard Style) + depcheck — there are no unit tests
pnpm run test-integration   # Build + run Spectron/Tape integration tests (dead — Playwright migration pending)
pnpm run package -- [darwin|linux|win32|all] [--arch=arm64] [--sign] [--package=<type>]
```

- **The app runs compiled code**: `index.js` requires `./build/main`, not `src/`. After editing `src/`, run `pnpm run build` (or use `pnpm start` / `pnpm run watch`, which build first). `bin/build.js` transpiles JSX and bundles only `src/renderer/main.js` (npm packages and `config.js` stay external requires); everything else is transpiled 1:1 CommonJS.
- Smoke-test launches must use `NODE_ENV=test` — it redirects config to an isolated `/tmp/WebTorrentTest` profile instead of the user's real `~/Library/Application Support/WebTorrent`.
- Requires Node 24 (`.nvmrc`) and pnpm 10; dependency security pins live in `pnpm-workspace.yaml` `overrides`.
- Code style: [standard](https://standardjs.com); JSX lives in plain `.js` files.

## Architecture

Electron app with **three processes**:

1. **Main process** (`src/main/`, entry `src/main/index.js`): window lifecycle, menus, dock/tray, keyboard shortcuts, auto-updater, folder watcher, external players, single-instance lock, and file/magnet-link open handling. `src/main/ipc.js` is the IPC hub.
2. **Main window renderer** (`src/renderer/main.js`): the React 17 + material-ui UI.
3. **WebTorrent hidden window** (`src/renderer/webtorrent.js`): the WebTorrent client runs in its own hidden BrowserWindow so torrent activity never blocks the UI. Created by `src/main/windows/webtorrent.js`; closing it only hides it.

`src/config.js` holds constants shared by all three processes (paths, URLs, `IS_PRODUCTION` / `IS_PORTABLE` / `IS_TEST` detection).

Renderers run with `nodeIntegration: true`, no context isolation, and use `@electron/remote` — old-style Electron with full Node access in renderer code.

### IPC

- Messages prefixed `wt-` are **relayed by the main process** between the main window and the hidden WebTorrent window (`src/main/ipc.js` patches `ipcMain.emit`; messages are queued until the WebTorrent window is ready). To talk to the torrent engine, the UI just calls `ipcRenderer.send('wt-...')`.
- The main process drives the UI by calling `windows.main.dispatch(action, ...args)`, which arrives in the renderer as a `dispatch` IPC message.
- Torrents are identified by `torrentKey` (ephemeral, reassigned every app run, usable before metadata arrives) and `infoHash` (stable). Both appear throughout the IPC protocol.

### Renderer data flow ("yo-yo" pattern)

Unidirectional loop defined in `src/renderer/main.js`:

1. A single mutable `state` object (created in `src/renderer/lib/state.js`) percolates down through all React components as props.
2. Components never mutate state directly; they call `dispatch(action, ...args)` (`src/renderer/lib/dispatcher.js`).
3. The `dispatchHandlers` map in `main.js` routes each action to a controller in `src/renderer/controllers/`, which mutates `state`.
4. `update()` re-renders the whole tree via `app.setState(state)`. It also runs on a 1-second interval, so the UI heals itself even without an explicit re-render.

Only `state.saved` is persisted (JSON written to `<config dir>/config.json`, debounced 1s via `State.save()`; `State.saveImmediate()` skips the debounce). It must stay JSON-serializable and must never contain absolute paths — the portable Windows build relocates its config dir. Schema changes need a migration in `src/renderer/lib/migrations.js`, which runs on every state load.

### Startup performance convention

The codebase aggressively optimizes app startup; follow the existing patterns:

- `require()` heavy modules lazily — inside the function or handler that needs them, not at the top of the file (see `src/main/ipc.js`, or the `fn-getter` controllers in `src/renderer/main.js`).
- Non-essential initialization is deferred ~3 seconds via `delayedInit` (in both `src/main/index.js` and `src/renderer/main.js`).

## Integration tests

Spectron + tape, driven by **screenshot diffing** against reference images in `test/screenshots/<platform>/`. Native dialogs are mocked in `test/mocks.js`; tests run with `NODE_ENV=test` and a temp profile (`/tmp/WebTorrentTest` or `C:\Windows\Temp\WebTorrentTest`).

- Screenshots are resolution-dependent: macOS needs a Retina screen at 2018 MacBook Pro 13" resolution; Windows needs Windows 10 at 1366×768. Don't touch the mouse or keyboard while tests run.
- If an intentional UI change breaks a screenshot test, delete the offending PNG and re-run — the test recreates it with the new look, and the PR diff then shows the exact pixel changes.

## Releases

See `RELEASE_PROCESS.md`. CI (`.github/workflows/ci.yml`) runs lint + build on push/PR (Ubuntu and macOS, pnpm/Node 24); installers are built via the manually-triggered `package.yml` workflow or `pnpm run package`.
