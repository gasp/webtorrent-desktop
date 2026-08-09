# Modernization & Maintenance Plan

This is a personally-maintained fork of [webtorrent-desktop](https://github.com/webtorrent/webtorrent-desktop),
kept alive and modernized with Claude Code. Upstream's last release (v0.24.0) was August 2020;
since then only dependency bots have touched the repo.

Plan drafted 2026-08-08 against commit `6c91af3`. Update the checkboxes and the decision log as work lands.

**Scope (decided 2026-08-09):** the full plan, executed phase by phase — each phase ends in a
tagged, releasable state, so work can pause after any of them.

**Baseline change (2026-08-09):** master now starts from
[gingergeek8192/webtorrent-desktop](https://github.com/gingergeek8192/webtorrent-desktop) — the
active arm64 rescue fork (see Phase 2 prior art) — instead of pristine upstream, so we join forces
rather than duplicate work. Coordination happens in upstream issue
[#1907](https://github.com/webtorrent/webtorrent-desktop/issues/1907) (Apple Silicon Support, open
since 2020), where gingergeek8192 announced a signed/notarized release "in the coming weeks" and
[tommyent's deep-modernization branch](https://github.com/tommyent/webtorrent-desktop/tree/modernization/electron-43-webtorrent-3)
is linked. Remotes: `origin` = our fork, `upstream` = webtorrent, `gingergeek` = their fork.

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

*(table updated 2026-08-09 for the gingergeek baseline; ✅ = solved by the baseline itself)*

| Component | Current | Status | Target |
|---|---|---|---|
| Electron | 39.8.10 (was 27) | declared at baseline, **unvalidated by us**; out of support (latest 3 = 40–42) | 42.x, then rolling |
| Mac packaging | arch is a CLI flag (`--arch=arm64`) | no arm64 build produced/verified by us yet; unsigned | native arm64, ad-hoc signed locally |
| Package manager | pnpm 10 (+ ~25 security overrides) | adopted with baseline; CI workflows still assume npm | pnpm everywhere incl. CI |
| Node (engines) | ^18–^24 ✅ | widened at baseline | pin 24 LTS in `.nvmrc`/CI |
| webtorrent | 1.9.7 | 2 majors behind; v2+ is ESM-only | 3.x |
| React | 17.0.2 | old but fine | 19 (after material-ui is replaced) |
| material-ui | 0.20.2 (2018) | abandoned; blocks React 18+ | MUI v7 or hand-rolled components |
| Integration tests | Spectron 19 + tape | dead (its chromedriver postinstall 404s on arm64 — build script disabled) | Playwright for Electron, same screenshot-diff idea |
| Packaging tools | @electron/packager 18, @electron/osx-sign, @electron/notarize ✅ | swapped at baseline | keep current |
| Vulnerabilities | 75 pre-baseline; many pinned via pnpm overrides | needs a fresh `pnpm audit` to re-baseline | 0 high/critical in prod deps |
| Renderer security | nodeIntegration, no contextIsolation, @electron/remote | legacy; `electron.remote` call sites now crash for real on E39 | contextBridge + preload, sandboxed UI renderer |

## Guiding principles

- **Always-working increments.** Tag the fork before/after each phase; any commit should be releasable.
- **One risk at a time.** Never combine an Electron major bump with an app refactor in the same change.
- **Personal use first.** macOS arm64 is the primary target; Linux best-effort; Windows only if needed.
- **Boring fixes over rewrites.** The three-process architecture and yo-yo state pattern stay unless they block something.

## Phase 0 — Working baseline (day 1–2)

- [x] Decide hosting (decision #1) and push the fork; add `upstream` remote for cherry-picking *(2026-08-09)*
- [x] Rebase master onto gingergeek8192's fork (baseline change above) *(2026-08-09)*
- [x] `pnpm install` + `pnpm run build` work on Tahoe/arm64 — required disabling `electron-chromedriver`
      and `spectron` build scripts in `pnpm-workspace.yaml` (both belong to the dead test stack) *(2026-08-09)*
- [ ] Pin Node 24 (`.nvmrc`); currently running on host Node 25
- [ ] Fix the 3 `electron.remote` call sites in `src/renderer/main.js` (use `@electron/remote`) —
      on the Electron 39 baseline these now break startup sound, cast discovery, and delayed init for real
- [ ] Check drag-drop of .torrent files: Electron ≥32 removed `File.path` (→ `webUtils.getPathForFile()`)
- [ ] `pnpm start` works; smoke-test core flows by hand: add torrent, download, stream video, ESC back,
      prefs, quit/state-save
- [ ] CI: workflows still run `npm install` — switch to pnpm (`pnpm/action-setup`), bump actions
      (checkout@v4, setup-node@v4), Node 24, add a macOS job; lint green
- [ ] Sync the one upstream commit we're behind (electron-winstaller 5.4.4 bot bump) or fold into Phase 1
- [ ] Tag `fork-baseline`

## Phase 1 — Security keep-alive (week 1)

- [ ] Re-baseline the audit under pnpm (`pnpm audit`): the baseline's ~25 workspace overrides already
      pin many vulnerable transitives (`got`, `ws`, `tar-fs`, `protobufjs`, `plist`, `semver`,
      `music-metadata`, `xmldom`, …) — verify what remains and fix or document it
- [ ] Decision #2: the casting stack (`chromecasts`, `dlnacasts`, `airplayer`, and their deps) is
      unmaintained and contributes a large share of the high-severity findings — keep, drop, or replace
      (note: tommyent's branch has "docs: define casting engine interface" + "refactor: move casting
      into torrent engine" — check before deciding)
- [ ] Validate the baseline's Electron 39, then 39→40→41→42 one major at a time, reading the official
      breaking-changes doc and smoke-testing before moving on. Known tripwires:
      - `File.path` removed (E32) → `webUtils.getPathForFile()` — verify fixed in Phase 0
      - `@electron/remote` version compatibility at each step
      - default `sandbox`/`webPreferences` shifts (app sets them explicitly, verify each window)
      - tommyent's branch is already on Electron 43 — mine it for the fixes each bump needed
- [x] Swap archived packagers: `@electron/packager` 18, `@electron/osx-sign`, `@electron/notarize`
      *(done at the gingergeek baseline)*
- [ ] Neutralize phone-home endpoints, which point at upstream's servers
      (`src/main/updater.js`, `src/main/announcement.js`, `src/renderer/lib/telemetry.js`,
      `src/crash-reporter.js`): disable, or repoint per decision #4
- [ ] Tag `v0.25.0-fork`

## Phase 2 — Apple Silicon native build (week 2) ← the deadline item

- [x] `bin/package.js`: arch selectable via `--arch=arm64` *(done at the gingergeek baseline)*
- [ ] Build the arm64 DMG ourselves: `pnpm run package -- darwin --arch=arm64`
- [ ] Signing for personal use: ad-hoc signature (`identity: '-'`) is enough for a locally-built app —
      gingergeek8192 says a notarized release is coming; adopt theirs if it lands first
- [ ] Verify: Activity Monitor shows *Apple* architecture; app launches with Rosetta not installed
- [ ] Confirm existing `~/Library/Application Support/WebTorrent/config.json` loads unchanged
- [ ] Deliverable: native arm64 DMG installed in /Applications replacing the Intel build

**Exit criterion: the app no longer needs Rosetta — the original "won't work on next macOS" problem is solved here.**
Everything after this phase is modernization depth, not survival.

> **Prior art (now our baseline):** [gingergeek8192/webtorrent-desktop](https://github.com/gingergeek8192/webtorrent-desktop)
> (June–July 2026): Electron 27→39.8.10, `@electron/packager`/`osx-sign`/`notarize` swap, npm→pnpm with
> ~25 security overrides pinning vulnerable transitives, arch as a CLI flag, unsigned arm64 DMG released
> as `v0.25.0-arm64` (author runs it daily on an M4 Pro). **Zero `src/` changes** — the `electron.remote`
> crash paths and Electron ≥32 `File.path` drag-drop breakage remain (our Phase 0). In upstream issue
> [#1907](https://github.com/webtorrent/webtorrent-desktop/issues/1907) (2026-07-30) they committed to a
> signed + notarized release "in the coming weeks" and further cleanup. We rebased our fork onto this
> work on 2026-08-09 to join forces.
>
> **Prior art (deep modernization):** [tommyent/webtorrent-desktop `modernization/electron-43-webtorrent-3`](https://github.com/tommyent/webtorrent-desktop/tree/modernization/electron-43-webtorrent-3)
> (July 2026, 25 commits / 103 files, linked from #1907): Electron 43, WebTorrent 3, React 17→18→19,
> material-ui replaced with native controls, Babel→esbuild, `@electron/remote` removed, sandboxed
> renderers, Playwright screenshot tests on macOS CI — essentially our Phases 1+3+4+5 in one branch.
> Unvetted by us and a huge diff, so we don't rebase onto it; instead **mine it commit-by-commit** when
> executing those phases (the commits are well-scoped). Author states they don't depend on the desktop
> app long-term.

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
| 5 | UI stack endgame | MUI v7 migration / hand-rolled components (tommyent's branch did this — evaluate) / leave material-ui until it breaks | **open** |
| 6 | Package manager | npm (minimal diff vs upstream) / pnpm (gingergeek baseline) | **✅ 2026-08-09: pnpm, adopted with the baseline** |
| 7 | Collaboration mode | Comment on #1907 + PR fixes to gingergeek8192 / stay a silent downstream / PR upstream anyway | **open — outreach comment drafted, awaiting go-ahead** |

## Success criteria

- Runs **natively on arm64** through macOS 27 and 28 — no Rosetta.
- Electron always within the supported window (latest 3 majors).
- 0 high/critical vulnerabilities in production dependencies.
- CI: lint + build + packaged-app smoke test on a macOS runner — no more "green while broken".
- Any commit on the fork's main branch is releasable.
