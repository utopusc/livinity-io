# update-smoke — D-07 Test-B harness (real `quitAndInstall` holder-survival re-verification)

This is a **local, per-user, non-destructive** re-verification of the Phase-1
spike's Test B (`spike/SPIKE-VERDICT.md`), which used the documented
`app.relaunch()+app.exit(0)` fallback because no real release existed yet.
This harness exercises the REAL `autoUpdater.quitAndInstall(true, true)` /
NSIS silent-swap path against a REAL engine (the `livinity` WSL distro),
observed by the Phase-1 watcher pattern.

**Zero WSL writes beyond a normal supervised engine start. Zero elevation.
Zero reboot. Never touches the public `desktop-latest` feed, the `v*`/
`rootfs-*` release channels, or `install.sh`.** See the plan's
`<live_smoke_rules>` for the full allowed/forbidden envelope.

**Never run this harness while a dev instance of the app is running** — the
packaged smoke build SHARES `%APPDATA%\livinity-desktop\{state.json,vault.bin,
holder.json,lockfile}` with dev runs (Pitfall 9). **Close any running dev
instance (`npm run dev` / `npm start`) FIRST** — since userData is literally
shared, a dev instance already holding the single-instance lockfile will make
the installed build's OWN launch get silently denied (immediate quit) rather
than actually starting, which breaks step 5 onward. The state.json backup in
step 5 is the data-safety guarantee; closing the dev instance is what makes
step 5 onward actually able to run at all.

> **PATH CORRECTION (07-11 execution-time finding):** `app.getPath('userData')`
> resolves from `package.json`'s `"name"` field (`livinity-desktop`) — there
> is no `productName` field in `package.json` (only in `electron-builder.yml`,
> which Electron's own userData resolution never reads) and no
> `app.setName()` call anywhere in `src/main/`. The real path is
> `%APPDATA%\livinity-desktop\` (all-lowercase, hyphenated) — NOT
> `%APPDATA%\Livinity Desktop\` as RESEARCH Q8 assumed. Verified live: the
> packaged `app.asar`'s `package.json` has no `productName` key, and
> `holder.json`/`state.json`/`vault.bin`/`lockfile` were all observed present
> under the lowercase path on the execution machine.
>
> **The install directory is ALSO lowercase** — empirically observed at
> execution as `%LOCALAPPDATA%\Programs\livinity-desktop\` (the HKCU
> Uninstall registry key's `InstallLocation`/`UninstallString`), not
> `...\Programs\Livinity Desktop\` as originally assumed — NSIS/
> electron-builder's default per-user install directory also derives from
> `package.json`'s `"name"`, not `productName`. Only the **executable
> filename** (`Livinity Desktop.exe`), the **uninstaller filename**
> (`Uninstall Livinity Desktop.exe`), and the Start-Menu/Programs-list
> **DisplayName** (`Livinity Desktop 0.0.1`) use `productName` — the folder
> itself does not. This is a documentation-only correction: the real
> `remove-executor.ts` Layer-1 uninstaller launch already derives the
> install dir dynamically via `path.dirname(app.getPath('exe'))` rather than
> a hardcoded path, so no production code is affected.

## The 9-step procedure

### 1. Build A/ and B/

```
node scripts/update-smoke/build-versions.mjs
```

Temporarily bumps `package.json` version to `0.0.1`, runs `npm run package`
(the same `build + electron-builder --win` path 07-08 gate-proved), stashes
`release/` into `scripts/update-smoke/.smoke/A/`; repeats for `0.0.2` into
`.smoke/B/`; restores the real `package.json` version in a `finally` (even on
a build failure). `A/` and `B/` each contain the `.exe`, `.blockmap`, and
`latest.yml` electron-builder generates when a `publish:` block is present
(no `--publish` flag is ever passed — nothing is uploaded anywhere).

### 2. Install A (per-user, silent)

Run the version-A installer silently:

```
"scripts\update-smoke\.smoke\A\Livinity-Desktop-Setup-0.0.1.exe" /S
```

This is a **local build with no Mark-of-the-Web** (Q1) — no SmartScreen
prompt by construction, and `oneClick + perMachine:false` installs to
`%LOCALAPPDATA%\Programs\livinity-desktop\` with no UAC.

### 3. Override the installed app's update feed

Overwrite the INSTALLED copy's `resources\app-update.yml` (plain YAML,
per-user-writable, sits outside `app.asar` — the sanctioned override seam,
NOT `forceDevUpdateConfig` and NOT a code change):

```yaml
provider: generic
url: http://127.0.0.1:8817/
updaterCacheDirName: livinity-desktop-updater   # keep this line intact -- confirm the real literal from the installed file first
```

Confirm the real `updaterCacheDirName` value already present in the
installed file before editing (RESEARCH Assumption A2) — copy it forward
verbatim, only replace `provider`/`url`.

### 4. Serve B/ on 127.0.0.1

```
node scripts/update-smoke/serve.mjs
```

Defaults to serving `.smoke/B/` on `http://127.0.0.1:8817/` (bound to
127.0.0.1 only — never reachable off-machine). GET-only; no old blockmap is
present in `B/`, so the expected path is a full download (Pitfall 1 — a
"Cannot download differentially, fallback to full download" log line is
happy-path noise, not a failure).

### 5. Back up state.json, then launch A + bring the engine up

```
copy "%APPDATA%\livinity-desktop\state.json" "%APPDATA%\livinity-desktop\state.json.smoke-backup"
```

(Pitfall 9 — the packaged smoke app SHARES userData with dev runs; this
backup is mandatory and is restored in step 9.)

Launch the installed A (`Livinity Desktop.exe` in
`%LOCALAPPDATA%\Programs\livinity-desktop\`), sign in / let the engine come
up against the REAL `livinity` distro via the normal supervised path (no
manual WSL commands — the app's own auto-bring-up + supervision does this).

### 6. Start the watcher

```
node scripts/update-smoke/watcher.mjs
```

Reads the REAL holder PID from `%APPDATA%\livinity-desktop\holder.json`
(`{pid, spawnedAt}`, `src/main/supervision/holder.ts`) and polls `tasklist`
every 2s, independent of the app process (never a child of it — run it from
its own terminal). Logs to `scripts/update-smoke/watcher-log.jsonl`.

### 7. Trigger the real update

In-app: **Settings → "Check for updates"** → wait for the status line to
reach `ready` (v0.0.2) → click **"Restart to update"**. This is a REAL
`autoUpdater.quitAndInstall(true, true)` (Q1.3 — never the bare defaults).

Before clicking, mark the watcher log:

```
node scripts/update-smoke/watcher.mjs --mark "TEST_B_QUITANDINSTALL_FIRED"
```

Scriptable alternative (no manual click): launch A with
`--remote-debugging-port=9222` and drive the Settings click via a CDP
`Runtime.evaluate`, mirroring `spike/cdp-eval.js`'s trigger shape
(RESEARCH Q8.7) — packaged builds accept the flag; no Electron fuses are
configured to block it.

### 8. Record the observations

From the watcher log + manual checks, record:

- **(a) Holder alive at T+0 / T+5 / T+30** across the NSIS swap — read the
  three watcher-log lines closest to those offsets after the mark. This is
  **UPD-01's criterion 2**, judged on this observed data (D-07). If the
  holder DIES: apply the pre-agreed contingency ladder (RESEARCH Q8 —
  quantify the supervised-respawn gap honestly; escalate to Candidate-C only
  if needed) and record it. Do NOT silently pass.
- **(b) Relaunched app reports 0.0.2** — check the About card / window title
  after the app reopens via `--force-run`.
- **(c) NO SmartScreen/UAC dialog** observed during the silent swap (closes
  Assumption A4/Q1 empirically).
- **(d) The observed `HKCU` Run value name**:
  ```
  reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
  ```
  with start-at-login enabled — expected `io.livinity.desktop` (closes
  Assumptions A1/A6/Q2).
- **(e) `main.log` shows `sha512 ok`** plus the expected
  differential-fallback line (`Cannot download differentially, fallback to
  full download`) — Pitfall 1's happy path, not an error.

### 9. Clean up

- Run the installed uninstaller silently:
  ```
  "%LOCALAPPDATA%\Programs\livinity-desktop\Uninstall Livinity Desktop.exe" /S
  ```
- Delete the updater cache: `%LOCALAPPDATA%\livinity-desktop-updater\`
- Restore the state.json backup:
  ```
  move /Y "%APPDATA%\livinity-desktop\state.json.smoke-backup" "%APPDATA%\livinity-desktop\state.json"
  ```
- Stop `serve.mjs` and `watcher.mjs` (Ctrl+C in each terminal).
- `scripts/update-smoke/.smoke/` and `watcher-log.jsonl` are local, disposable,
  gitignored build/runtime output — safe to delete or leave for later re-runs.

## What this harness validates vs. what stays operator UAT

**Validated here (pre-UAT):** real `quitAndInstall` process-death-and-replacement
with a REAL NSIS swap; holder survival (the spike verdict's explicitly-ordered
re-verification); silent unsigned apply with zero dialogs; the Run value name;
the updater state machine end-to-end against a generic feed; `autoInstallOnAppQuit`
(optionally, via a tray-Quit round instead of the explicit Restart-to-update click).

**Stays operator UAT** (`07-HUMAN-UAT.md`): the PUBLIC GitHub `desktop-latest`
round trip (real 302 chain, `RELEASING.md` end-to-end, `--clobber` behavior),
the first-install browser-download SmartScreen experience, uninstall via
Windows Settings (Layer-2-only path), and the Remove-flow live CF teardown
against a real zone.
