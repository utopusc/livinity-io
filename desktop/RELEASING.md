# Releasing Livinity Desktop

Manual publish flow (D-03). No CI workflow builds or publishes desktop
releases in v1 -- builds are unsigned + local, and touching CI risks the
box's own `.github/workflows/release.yml` (`v*` glob). This is a
deliberately narrow, numbered runbook: follow it in order, every time.

**Never touch the box's channels.** The box updates from `GET
/releases/latest`, which resolves to whatever release is tagged `v*` and
NOT marked prerelease. The rootfs channel is the pinned `rootfs-v1` /
`rootfs-v2` tags. Desktop releases use a completely different scheme
(`desktop-vX.Y.Z`, always `--prerelease --latest=false`) specifically so
they can never become "the latest release" and can never collide with
either of those channels. If a `gh` command below doesn't start with
`desktop-`, stop and re-read it.

## 1. Bump the version

Edit `package.json`'s `"version"` field to the new `X.Y.Z` (semver, no `v`
prefix, no prerelease suffix -- `allowDowngrade: false` comparisons stay
trivial only with plain semver). Commit this alongside the code it ships.

## 2. Build the artifact

```
npm run package
```

This runs `npm run build` (tsc + vite) then `electron-builder --win`. First
run on a machine ever will download electron-builder's NSIS toolchain to
`%LOCALAPPDATA%\electron-builder\Cache` -- one-time network need.

Confirm `release/` now contains exactly these three files for the new
version (electron-builder generates `latest.yml` automatically because
`electron-builder.yml`'s `publish` block is present -- no `--publish` flag
needed, a local build never uploads anything on its own):

- `Livinity-Desktop-Setup-X.Y.Z.exe`
- `Livinity-Desktop-Setup-X.Y.Z.exe.blockmap`
- `latest.yml`

## 3. Run the build gate

```
node scripts/check-artifact.mjs release/win-unpacked
```

Must print `check-artifact: PASS`. Do not publish an artifact that fails
this gate -- it checks for the packaged electron-updater, no stray dev
files in the asar, no secret-shaped literals, and no spaces in the
filename (the last one specifically matters for step 5 below).

## 4. Create the immutable per-version release (provenance / rollback)

```
gh release create desktop-vX.Y.Z \
  --prerelease --latest=false \
  --title "Livinity Desktop vX.Y.Z" \
  --notes "Livinity Desktop vX.Y.Z" \
  release/Livinity-Desktop-Setup-X.Y.Z.exe \
  release/Livinity-Desktop-Setup-X.Y.Z.exe.blockmap \
  release/latest.yml
```

`--prerelease --latest=false` is mandatory on every desktop release (D-01).
This tag is never touched again after creation -- it is the rollback/
provenance copy for this exact version.

## 5. Update the rolling feed

The `desktop-latest` release is what electron-updater's generic provider
actually polls (`.../releases/download/desktop-latest/latest.yml`). It must
always hold the CURRENT version's three files. Upload the **exe and
blockmap FIRST, `latest.yml` LAST** (Pitfall 7) -- if a client polls
mid-upload, an updated `latest.yml` pointing at an exe that isn't there yet
is a broken update; an old `latest.yml` still pointing at the old (still
present) exe is merely a no-op poll.

```
gh release upload desktop-latest --clobber \
  release/Livinity-Desktop-Setup-X.Y.Z.exe \
  release/Livinity-Desktop-Setup-X.Y.Z.exe.blockmap

gh release upload desktop-latest --clobber \
  release/latest.yml
```

If `desktop-latest` doesn't exist yet (first-ever release), create it once
with the same `--prerelease --latest=false` flags before the first upload:

```
gh release create desktop-latest \
  --prerelease --latest=false \
  --title "Livinity Desktop -- rolling update feed" \
  --notes "Do not download this release directly -- it is the auto-update feed. Install from the versioned desktop-vX.Y.Z release."
```

## 6. Keep N-1 on the feed

Do **not** delete the previous version's exe + blockmap from
`desktop-latest` when uploading a new version -- `--clobber` only replaces
files with the same name, so the old-version files stay put automatically.
Keeping the N-1 pair lets electron-updater's differential-update path work
(it fetches the OLD blockmap from the same feed to compute a delta) and
gives an instant rollback target. Only ever prune older-than-N-1 files, and
only if the feed is getting unreasonably large.

## 7. Allow a few minutes for CDN propagation

GitHub Releases assets are served through a CDN
(`objects.githubusercontent.com` after a 302 redirect). A newly uploaded
`latest.yml` or exe can take a few minutes to be consistently visible
everywhere. Don't panic-reupload if a check immediately after step 5 looks
stale -- wait, then re-check.

## Channel summary (do not deviate)

| Channel | Tag scheme | prerelease/latest flags | Consumed by |
|---|---|---|---|
| Box | `vXX.Y` | latest (default) | livinityd's update.sh / `GET /releases/latest` |
| Rootfs | `rootfs-v1`, `rootfs-v2`, ... | `--prerelease --latest=false` | box provisioning (pinned, manual bump) |
| Desktop (this doc) | `desktop-vX.Y.Z` | `--prerelease --latest=false` | provenance/rollback only, never polled |
| Desktop feed | `desktop-latest` (fixed name) | `--prerelease --latest=false` | electron-updater generic provider (polled every 6h + at app-ready+3min) |

Never run a `gh release` command against `v*` or `rootfs-*` from this
runbook. If you're ever unsure which channel a command touches, stop and
check the tag against this table first.
