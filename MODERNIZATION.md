# Modernization & Maintenance Plan

This is a personally-maintained fork of [webtorrent-desktop](https://github.com/webtorrent/webtorrent-desktop),
kept alive and modernized with Claude Code. Upstream's last release (v0.24.0) was August 2020;
since then only dependency bots have touched the repo.

Plan drafted 2026-08-08 against commit `6c91af3`. Update the checkboxes and the decision log as work lands.

**Scope (decided 2026-08-09):** the full plan, executed phase by phase — each phase ends in a
tagged, releasable state, so work can pause after any of them.

## Why this is urgent

1. **macOS deadline (the hard one).** The Mac app is packaged **x64-only** (`bin/package.js`), so on
   Apple Silicon it runs through Rosetta 2. Apple's timeline:
   - macOS 26 Tahoe (current) — last macOS for Intel Macs.
   - macOS 27 "Golden Gate" (fall 2026) — Apple Silicon only; Rosetta 2 no longer installed by default
     (still reinstallable on demand).
   - macOS 28 (fall 2027) — Rosetta 2 removed for regular apps (kept only for a whitelist of old games).
     **Intel-only apps will not launch.**

   Fix: build native `arm64` binaries. Friction starts fall 2026; hard stop fall 2027.

2. **Security debt.** `npm audit` (2026-08-08): **75 vulnerabilities — 3 critical, 46 high**.
   Electron 27 is long past end-of-life (Electron supports the latest 3 majors; stable is 42.x as of
   Aug 2026), meaning years of unpatched Chromium/Node CVEs in the runtime.

3. **Broken master.** `src/renderer/main.js` still calls `electron.remote.getCurrentWindow()`
   (3 call sites) — the built-in `remote` module was removed in Electron 14, and nothing patches it.
   Master throws at startup on the Electron 27 it declares. CI only runs the linter, so nobody noticed.
   The first job is restoring a working baseline, not bumping versions.

4. **Dead toolchain.** Node 16/18 (engines) are EOL; Spectron (integration tests) was discontinued in
   2022 and cannot drive Electron 27 anyway; `electron-packager`/`electron-osx-sign`/`electron-notarize`
   were superseded by the `@electron/*` scoped packages.

## Current state → target

| Component | Current | Status | Target |
|---|---|---|---|
| Electron | 27.3.11 | EOL, ~15 majors behind | 42.x, then rolling (stay within latest 3) |
| Mac packaging | x64 only | dies with Rosetta (≤ fall 2027) | arm64 (primary), x64 kept while feasible |
| Node (engines) | ^16 \|\| ^18 | both EOL | 24 LTS (supported to Apr 2028) |
| webtorrent | 1.9.7 | 2 majors behind; v2+ is ESM-only | 3.x |
| React | 17.0.2 | old but fine | 19 (after material-ui is replaced) |
| material-ui | 0.20.2 (2018) | abandoned; blocks React 18+ | MUI v7 or hand-rolled components |
| Integration tests | Spectron 19 + tape | dead, already broken | Playwright for Electron, same screenshot-diff idea |
| Packaging tools | electron-packager 17, electron-osx-sign, electron-notarize | archived | @electron/packager, @electron/osx-sign, @electron/notarize (notarytool) |
| npm audit | 75 vulns (3C/46H) | — | 0 high/critical in prod deps |
| Renderer security | nodeIntegration, no contextIsolation, @electron/remote | legacy | contextBridge + preload, sandboxed UI renderer |

## Guiding principles

- **Always-working increments.** Tag the fork before/after each phase; any commit should be releasable.
- **One risk at a time.** Never combine an Electron major bump with an app refactor in the same change.
- **Personal use first.** macOS arm64 is the primary target; Linux best-effort; Windows only if needed.
- **Boring fixes over rewrites.** The three-process architecture and yo-yo state pattern stay unless they block something.

## Phase 0 — Working baseline (day 1–2)

- [ ] Decide hosting (decision #1) and push the fork; add `upstream` remote for cherry-picking
- [ ] Pin Node 24 (`.nvmrc` + `engines`), `npm install`, `npm run build`
- [ ] Fix the 3 `electron.remote` call sites in `src/renderer/main.js` (use `@electron/remote`)
- [ ] `npm start` works on Tahoe/arm64 (dev-mode Electron is already native arm64 — only *packaged* builds are x64)
- [ ] Smoke-test core flows by hand: add torrent, download, stream video, ESC back, prefs, quit/state-save
- [ ] Confirm integration tests are dead (expected); park them until Phase 5
- [ ] CI: bump actions (checkout@v4, setup-node@v4), Node 24, add a macOS job; lint green
- [ ] Tag `fork-baseline`

## Phase 1 — Security keep-alive (week 1)

- [ ] Triage `npm audit`: bump prod deps with straightforward patched releases first
      (`plist` and `protobufjs` are the criticals); record unfixable ones and their exposure
- [ ] Decision #2: the casting stack (`chromecasts`, `dlnacasts`, `airplayer`, and their deps) is
      unmaintained and contributes a large share of the high-severity findings — keep, drop, or replace
- [ ] Electron 27 → 42 **in stages** (27→30→33→36→39→42), reading the official breaking-changes doc at
      each major and smoke-testing the app before moving on. Known tripwires:
      - `File.path` removed (E32) → `webUtils.getPathForFile()`; breaks drag-drop and `<input type=file>` paths in the renderer
      - `@electron/remote` version compatibility at each step
      - default `sandbox`/`webPreferences` shifts (app sets them explicitly, verify each window)
- [ ] Swap archived packagers: `@electron/packager`, `@electron/osx-sign`, `@electron/notarize`
- [ ] Neutralize phone-home endpoints, which point at upstream's servers
      (`src/main/updater.js`, `src/main/announcement.js`, `src/renderer/lib/telemetry.js`,
      `src/crash-reporter.js`): disable, or repoint per decision #4
- [ ] Tag `v0.25.0-fork`

## Phase 2 — Apple Silicon native build (week 2) ← the deadline item

- [ ] `bin/package.js`: darwin `arch: ['arm64', 'x64']` (or a universal build — decide by binary size)
- [ ] Signing for personal use: ad-hoc signature (`identity: '-'`) is enough for a locally-built app;
      optional later: Developer ID + notarization via notarytool
- [ ] Verify: Activity Monitor shows *Apple* architecture; app launches with Rosetta not installed
- [ ] Confirm existing `~/Library/Application Support/WebTorrent/config.json` loads unchanged
- [ ] Deliverable: native arm64 DMG installed in /Applications replacing the Intel build

**Exit criterion: the app no longer needs Rosetta — the original "won't work on next macOS" problem is solved here.**
Everything after this phase is modernization depth, not survival.

> **Prior art:** [gingergeek8192/webtorrent-desktop](https://github.com/gingergeek8192/webtorrent-desktop)
> (June–July 2026) shipped the minimal version of this phase: Electron bumped straight to 39.8.10,
> `bin/package.js` arch turned into a CLI flag (`--arch=arm64`), npm→pnpm, and an unsigned arm64 DMG
> released as `v0.25.0-arm64`. **Zero `src/` changes** — so the `electron.remote` startup crash and the
> Electron ≥32 `File.path` drag-drop breakage ship in that build; it also tells downloaders to disable
> Gatekeeper system-wide (`spctl --master-disable`), which we won't do (local build / ad-hoc sign instead).
> Useful to us: proves electron-packager 17 produces working arm64 darwin builds and that the app shell
> boots on a modern Electron; the tiny arch-flag patch is worth cherry-picking.

## Phase 3 — Torrent engine current (weeks 3–4)

- [ ] Introduce esbuild bundling for the app source (consumes ESM-only deps regardless of authoring
      style; also cuts startup cost — this codebase lazy-requires everywhere to compensate)
- [ ] webtorrent 1.x → 3.x following the official migration guide
      (ESM-only; HTTP server API split; `file.getBuffer()` → web APIs; file-selection API changes)
- [ ] Related majors, all ESM now: `parse-torrent`, `create-torrent`, `music-metadata`
- [ ] Optional: move the torrent engine from the hidden BrowserWindow to Electron's `utilityProcess`
      (the modern pattern; keeps the `wt-*` relay protocol in `src/main/ipc.js` conceptually intact)
- [ ] Regression pass: download, seed, create torrent, stream to `<video>`, poster generation,
      audio metadata, per-file selection, resume-on-restart

## Phase 4 — Electron security model (weeks 5–6)

- [ ] Inventory renderer Node usage (`fs`, `path`, `os`, direct `electron` requires across
      `src/renderer/controllers/` and components)
- [ ] Add a preload script exposing a typed API via `contextBridge`; flip the UI window to
      `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [ ] Remove `@electron/remote` entirely (replace with IPC round-trips)
- [ ] Add a CSP to `static/*.html`

## Phase 5 — UI & toolchain modernization (weeks 7–10, elective — decision #5)

- [ ] Replace material-ui 0.20 (abandoned since 2018; hard-blocks React 18+): either migrate to MUI v7
      or hand-roll the ~8 widget types the app actually uses (buttons, checkboxes, selects, sliders,
      text fields, modals, headers, lists)
- [ ] React 17 → 19 (`ReactDOM.render` → `createRoot`; the 1 Hz `update()` re-render loop still works)
- [ ] Rebuild integration tests on Playwright for Electron, keeping the screenshot-diff philosophy;
      make them runnable in CI on a macOS runner
- [ ] Lint: keep `standard` while it works; fall back to eslint 9 flat config (neostandard) if it rots
- [ ] `npm audit` clean including dev deps

## Phase 6 — Steady state (ongoing)

- Renovate (upstream's config is already in package.json) or Dependabot on the fork;
  automerge patch/minor once CI actually builds and smoke-tests
- Electron: adopt each new major within ~4 weeks of stable; never fall out of the supported window again
- Monthly: `npm audit` + `npm outdated` sweep, build, smoke test, tag
- Each summer: test on the macOS developer beta (this is what would have caught the Rosetta cliff years early)
- A scheduled Claude Code routine runs the monthly sweep and opens a PR with findings
  (**confirmed 2026-08-09** — to be set up once Phase 1 lands and the build is trustworthy)

## Decision log

| # | Decision | Options | Status |
|---|---|---|---|
| 1 | Where the fork lives | Public GitHub fork (keeps upstream link, can PR patches back) / private mirror repo (GitHub forks of public repos can't be private) | **✅ 2026-08-09: public fork `gasp/webtorrent-desktop`** |
| 2 | Casting support (Chromecast/DLNA/AirPlay) | Keep & patch / drop (largest vuln source, unmaintained deps) / re-add later with modern libs | **open** |
| 3 | Windows/Linux packaging | Keep all / Linux best-effort, drop Windows / macOS only | **open** |
| 4 | Auto-update for the fork | Disable (rebuild manually) / GitHub-releases-based updates, e.g. update-electron-app (requires public repo) | **open** |
| 5 | UI stack endgame | MUI v7 migration / hand-rolled components / leave material-ui until it breaks | **open** |

## Success criteria

- Runs **natively on arm64** through macOS 27 and 28 — no Rosetta.
- Electron always within the supported window (latest 3 majors).
- 0 high/critical vulnerabilities in production dependencies.
- CI: lint + build + packaged-app smoke test on a macOS runner — no more "green while broken".
- Any commit on the fork's main branch is releasable.
