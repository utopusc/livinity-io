---
phase: 30
phase_name: Auto-Update Notification (GitHub-Aware)
milestone: v28.0
created: 2026-04-26
status: pending
---

# Phase 30 — Auto-Update Notification (GitHub-Aware)

## Why now

The legacy Umbrel OTA infrastructure (`getLatestRelease` → `https://api.livinity.io/latest-release`, `performUpdate` → downloaded `updateScript` + reboot) is incompatible with the actual deployment model used today:

- Code is shipped as raw commits to `utopusc/livinity-io` (master branch), not tagged GitHub releases.
- Deploys run `bash /opt/livos/update.sh` which rsyncs source from a fresh tmp clone, builds, and `systemctl restart`s services. **No reboot.**
- Existing `system.checkUpdate` always returns "no update available" because the `api.livinity.io` server returns nothing meaningful for this fork.

The user wants a notification that fires when there's a newer commit on master, with one-click "Update" that runs the same update.sh they'd run manually via SSH.

## Scope (LOCKED)

In scope:
- **Backend**: rewrite `getLatestRelease` to use the public GitHub commits API; rewrite `performUpdate` to spawn `bash /opt/livos/update.sh` and stream progress. Patch `update.sh` to write `/opt/livos/.deployed-sha`.
- **Frontend**: new `<UpdateNotification />` component (bottom-right card on desktop); add 1h polling to `useSoftwareUpdate`; mount component in router.tsx.
- **Existing UX preserved**: clicking "Update" routes to existing `/settings/software-update/confirm` dialog (no behavior change there).

Out of scope:
- Auto-applying updates (stays user-confirmed).
- Update channels (the `releaseChannel` setting stays for future use; ignored in v1).
- Showing notification on mobile (component renders on desktop only — `<MobileTabBar />` users are typically transient).
- Backend reboot logic (update.sh restarts services itself).

## Requirements

### UPD-01 — Backend `system.checkUpdate` queries GitHub

`livos/packages/livinityd/source/modules/system/update.ts`'in `getLatestRelease()` fonksiyonu yeniden yazılır:
- `https://api.github.com/repos/utopusc/livinity-io/commits/master` çağırır
- Headers: `User-Agent: LivOS-{version}` (GitHub zorunlu kılar), `Accept: application/vnd.github+json`
- Response'tan `sha`, `commit.message`, `commit.author.name`, `commit.author.date` extract eder
- Yerel SHA: `/opt/livos/.deployed-sha` dosyasını oku (yoksa boş string → her zaman update available göster, ki kullanıcı ilk update'i alabilsin)
- `available = remoteSha !== localSha`
- Return shape (TypeScript, geriye uyumlu olmasın — sade tut):
  ```ts
  { available: boolean, sha: string, shortSha: string, message: string, author: string, committedAt: string }
  ```
- 60 req/hr unauth limit yeter — UI 1h'de bir poll ediyor
- Network/parse error: throw → frontend toast.error gösterir

NOT: `releaseChannel` setting okunabilir kalsın (settings store değişmez), ama bu turda kullanılmıyor.

### UPD-02 — Backend `system.update` runs update.sh as subprocess

`performUpdate()` yeniden yazılır:
- `setUpdateStatus({running: true, progress: 5, description: 'Starting update...', error: false})`
- `child_process.spawn('bash', ['/opt/livos/update.sh'], {cwd: '/opt/livos'})` — stdout/stderr stream
- Output parse:
  - `===` veya `━━` ile başlayan satırlar → progress section markers (parse "Building UI" / "Restarting services" gibi)
  - Sectioned progress: 10 (Pulling latest), 30 (Installing deps), 50 (Building config), 65 (Building UI), 85 (Building Nexus), 95 (Restarting services), 100 (Done)
  - "[OK]" satırları → progress increment
- Subprocess exit: code 0 → `setUpdateStatus({running: false, progress: 100, description: 'Updated', error: false})`. Non-zero → `setUpdateStatus({error: 'Update failed: ...'})`.
- **DO NOT REBOOT.** update.sh `systemctl restart`s services itself; calling reboot would crash the user out of their session.
- `systemStatus` set 'updating' duration boyunca (mevcut behavior korunur)

NOT: Sudo gereksinim — livinityd UID'sinin `sudo bash /opt/livos/update.sh`'ı NOPASS çalıştırabilmesi lazım. Sudoers config kontrolü REQUIREMENTS dışı (sysadmin işi); execution sırasında user'a "if you see permission denied: add livinityd user to sudoers NOPASS for /opt/livos/update.sh" notu yaz.

### UPD-03 — `/opt/livos/update.sh` writes deployed SHA

update.sh'a EKLE (success banner'dan ÖNCE):
```bash
# Write deployed SHA so livinityd can compare against GitHub
if [[ -d "$TEMP_DIR/livos/.git" ]]; then
    git -C "$TEMP_DIR/livos" rev-parse HEAD > /opt/livos/.deployed-sha 2>/dev/null || true
fi
```

Zaten `update.sh` GitHub'dan `/tmp/livinity-update-*/livos`'a clone ediyor — temp dir hazır. Bu satır clone'un HEAD SHA'sını yazar, sonra services restart olur. livinityd next checkUpdate query'de bu dosyayı okur.

NOT: update.sh repo'da YOK (Mini PC'de standalone script). Round 1 hot-patch'te SSH ile sed-edit ettik. Bu turda da **SSH üzerinden** patch atılır — repo dosyası yok, commit edemeyiz.

### UPD-04 — Frontend UpdateNotification component + hook polling + mount

**Component:** `livos/packages/ui/src/components/update-notification.tsx` (YENİ)
- `useSoftwareUpdate()` çağırır
- localStorage key: `livos:update-notification:dismissed-sha`
- Render conditions:
  - `state === 'update-available'`
  - `latestVersion?.sha` mevcut
  - `latestVersion.sha !== dismissedSha` (yeni SHA dismissed değil)
- Render:
  - Position: `fixed bottom-4 right-4 z-[80]`
  - Card: `w-80 bg-white border border-zinc-200 shadow-lg rounded-radius-lg p-4 flex flex-col gap-3`
  - Header: `<TbDownload size={20} />` icon + bold "New update available"
  - Body: small `text-zinc-500` "{shortSha} — {message slice 80}" + tiny "{author}, {relative committedAt}"
  - 2 button row:
    - "Update" — primary blue, click navigates to `/settings/software-update/confirm` via `useNavigate()`
    - "Later" — outline/ghost, click writes `latestVersion.sha` to localStorage + setState dismissed=true
  - framer-motion fade-in/slide-up: `initial={{opacity:0, y:20}} animate={{opacity:1, y:0}}`
- Mobile: `useIsMobile()` ile gizle (mobile-tab-bar overlap'i önler)

**Hook polling:** `livos/packages/ui/src/hooks/use-software-update.ts`
- `useQuery` options'a EKLE: `refetchInterval: 60 * 60 * 1000` (1 saat)
- Diğer optionlar değişmez

**Router mount:** `livos/packages/ui/src/router.tsx`
- Desktop route element JSX'inde — `FloatingIslandContainer` veya `DockBottomPositioner` yakınında
- Import: `import {UpdateNotification} from '@/components/update-notification'`
- Render: `<UpdateNotification />` (auth-gated path zaten `EnsureLoggedIn` içinde, otomatik)

## Plans

- **30-01-PLAN.md** — Backend: update.ts rewrite (UPD-01 + UPD-02) + update.sh patch via SSH (UPD-03)
- **30-02-PLAN.md** — Frontend: component + hook polling + router mount (UPD-04) + integration (build + commit + push + deploy + browser verify)

## Dependencies

- `axios` or `fetch` (native fetch zaten kullanılıyor in update.ts)
- `child_process.spawn` (Node built-in)
- `framer-motion` (frontend, zaten dep)
- `@tabler/icons-react` (TbDownload, zaten dep)
- GitHub API public unauth quota (60 req/hr — yeterli)

## Risk / failure modes

- **Sudo denial**: livinityd subprocess `sudo bash /opt/livos/update.sh` çağırırsa NOPASS gerekir. Eğer izin yoksa `system.update` mutation hata döner ve UI gösterir. Kullanıcıya çözümü logla: "add to /etc/sudoers: `livinityd ALL=(root) NOPASSWD: /opt/livos/update.sh`". Mini PC'de bruce sudo NOPASS aktif (memory'de var) — livinityd çalıştıran user neyse o için ayarlanmalı.
- **GitHub rate limit**: 60 req/hr unauth, 1h poll → 1 req/hr — neredeyse imkansız limit hit. Yine de error path düzgün handle.
- **Subprocess timeout**: update.sh ~60-90s sürer. Spawn için timeout YOK (let it run); UI updateStatus poll ediyor, kullanıcı ilerleme görür.
- **Concurrent update calls**: `system.update` mutation iki kez çağrılırsa subprocess'in çakışması olabilir. `systemStatus === 'updating'` ise mutation early-return throw etsin.

## Exit criteria

- [x] Backend: `system.checkUpdate` yeni shape döner, GitHub'a query yapar — Plan 30-01 (UPD-01) completed 2026-04-26
- [x] Backend: `system.update` update.sh subprocess çalıştırır + log streamer — Plan 30-01 (UPD-02) completed 2026-04-26
- [x] Mini PC + Server4: `/opt/livos/update.sh` `.deployed-sha` yazar (SSH patch) — Plan 30-01 (UPD-03) completed 2026-04-26 + bootstrap b6981b5f on both hosts
- [ ] Frontend: `<UpdateNotification />` component yazılı + mount edilmiş
- [ ] Frontend: useSoftwareUpdate 1h polling
- [ ] Browser verify: localStorage'tan dismissed-sha sil → yeni SHA push'la → notification görünmeli → "Later" tıklarsa yarın aynı SHA push'lasak notification yine görünmemeli, ama daha yeni SHA gelse görünmeli
- [ ] Tıklayınca confirm dialog açılır (pencere kapatılmaz)
- [ ] update.sh subprocess başarılı çalıştırır, services restart olur
