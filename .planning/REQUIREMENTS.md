# Requirements: LivOS v29.0 — Deploy & Update Stability

**Defined:** 2026-04-26
**Core Value:** Tek tıkla güvenli, gözlemlenebilir, geri-alınabilir LivOS update'i — kullanıcı SSH'lanmadan güvenle update edebilsin.
**Milestone Goal:** Backlog 999.5/5b/6/1 (CRITICAL update.sh silent fails + UI silent error) kapatılır + auto-rollback / observability UI / CI smoke test surface'ları eklenir.

---

## v29.0 Requirements

### Build Pipeline Integrity (BUILD)

Phase 30 deploy turlarında her seferinde tetiklenen `update.sh` build silent-fail bug'ını kökünden çözer. Backlog 999.5 + 999.5b kapatılır.

- [x] **BUILD-01
**: `update.sh` build adımı sonunda her paketin `dist/` (veya eşdeğer build çıktısı) dolu olduğunu doğrular; boşsa exit non-zero ile fail-loud — sessiz başarı log'u (`[OK] @livos/config built`) artık yalan söyleyemez.
- [x] **BUILD-02
**: `update.sh` pnpm-store dist-copy adımı `@nexus+core*` dizinlerinin TÜMÜ üzerinde idempotent çalışır (sharp/version drift kaynaklı multi-resolution dirs için), copy sonrası target boşsa fail-loud.
- [x] **BUILD-03**: `update.sh` build silent-fail root-cause (cwd / env / pnpm-lock drift) tespit edilir ve tetikleyici neden ortadan kaldırılır — BUILD-01 guard'ı tekrar tetiklenmemeli. **(Closed 2026-04-26 by Phase 31 Plan 01: verdict INCONCLUSIVE on single trigger; BUILD-01 fail-loud guard becomes the safety net per CONTEXT decision. Two non-trigger bugs confirmed by code reading and queued for Plan 02 patch. Investigation: `.planning/phases/31-update-sh-build-pipeline-integrity/31-ROOT-CAUSE.md`.)**
- [ ] **BUILD-04**: GitHub Actions workflow her PR'da Docker container içinde tam `update.sh` koşar ve livinityd boot health check (`curl -fsS http://localhost:8080/health` + livinityd PID alive 30s) yapar; başarısız PR mergelenemez.

### Update UX & Error Surfacing (UX)

Phase 30 sonrası UAT'de tespit edilen "Install Update tıklandı, hiçbir şey olmadı" silent-fail (BACKLOG 999.6) kapatılır + tıklama-tıklamı UX boşlukları doldurulur.

- [ ] **UX-01**: `system.update` mutation `onError` her çağırıcıda kullanıcıya toast olarak yüzeye çıkar (actionable error text — "Disk full" / "GitHub unreachable" / "WS disconnected").
- [ ] **UX-02**: Install Update butonu `mutation.isPending` boyunca disable + UpdatingCover dismiss-guard (kullanıcı modali kazara kapatamaz, geri-press disabled).
- [ ] **UX-03**: `system.update` (ve diğer long-running mutations: `system.checkUpdate`) `httpOnlyPaths` listesine alınır — WS hang-up sırasında HTTP transport'tan akar, silent-drop biter.
- [ ] **UX-04**: Settings sidebar'da update mevcutsa "Software Update" satırının yanında bir badge gösterilir (BACKLOG 999.1).

### Reliability & Auto-Rollback (REL)

`update.sh` başarıyla bitse bile livinityd başlamazsa kullanıcı handasız kalmasın — sistem otomatik geri sarsın.

- [ ] **REL-01**: livinityd 3 ardışık başarısız boot sonrası (systemd `OnFailure=` veya watchdog script) `/opt/livos/.deployed-sha` dosyasını önceki SHA'ya geri çevirir + livos.service restart eder + kullanıcıya rollback olayını UI'da bildirir.
- [ ] **REL-02**: `update.sh` başlamadan önce sanity check yapar — disk free > 2GB, `/opt/livos` write access, GitHub `api.github.com/repos/utopusc/livinity-io` reachable; herhangi biri fail ederse mutation `onError`'a anlamlı sebep ile döner (UX-01 ile kombine).

### Observability (OBS)

Bir update'in ne yaptığı/neden başarısız olduğu tarayıcıdan görülebilir olsun — SSH'a düşmeden teşhis.

- [ ] **OBS-01**: `update.sh` her koşusunda yapılandırılmış log dosyası yazar — `/opt/livos/data/update-history/update-<ISO-timestamp>-<sha>.log` formatında, tüm step'ler + exit code + duration.
- [ ] **OBS-02**: Settings > Software Update sayfasında "Past Deploys" listesi gösterilir — `update-history/*.log` dosyalarından okunan SHA, timestamp, status (success/failed/rolled-back), duration tablosu, en yeni en üstte, son 50 entry.
- [ ] **OBS-03**: Past Deploys satırı tıklanınca log viewer modal açılır (tail -n 500 of update log + "Download full log" butonu) — kullanıcı CVE-style log'u kopyalayıp issue açabilir.

---

## Future Requirements (deferred to later milestones)

- One-click "Roll back to specific past deploy" UI (REL-01 sadece otomatik rollback yapar, manuel rollback UI Phase v30+'da)
- Update progress streaming via SSE (şu an polling — gerçek-zamanlı progress bar future)
- Update reminder / auto-update on schedule (cron'a gömülü zamanlanmış update — şu an her zaman manuel)
- Multi-host rollout coordination (birden fazla LivOS host'u olan kullanıcı için staged rollout — multi-deployment Phase'inde)
- Update e-mail / push notification (deploy bitti / fail oldu — notification milestone'unda)

## Out of Scope

- LivOS *kendisinin* hot-reload / zero-downtime update — service restart kabul edilebilir, downtime hedefi <30s
- update.sh'i repoya taşımak — yerel değişiklik tolerasyonu nedeniyle dışarda kalır (Phase 30 patch-script + bootstrap precedent korunur)
- Nexus tarafının ayrı update flow'u — `update.sh` tek script, hem livos hem nexus'u atomik update eder
- Rollback'in volume / DB schema migration desteği — schema downgrade yapılmaz, REL-01 sadece kod SHA'sını geri çevirir; data migration eklenirse forward-only
- Native auto-update (apt / homebrew style) — kendi `update.sh`'ımız tek dağıtım kanalı
- Cross-platform update (macOS / Windows host) — sadece Linux-systemd hedef

## Traceability

13/13 requirements mapped to Phases 31–35. Zero orphans, zero duplicates.

| REQ-ID   | Phase # | Phase Name                                |
|----------|---------|-------------------------------------------|
| BUILD-01 | 31      | update.sh Build Pipeline Integrity        |
| BUILD-02 | 31      | update.sh Build Pipeline Integrity        |
| BUILD-03 | 31      | update.sh Build Pipeline Integrity        |
| BUILD-04 | 35      | GitHub Actions update.sh Smoke Test       |
| UX-01    | 34      | Update UX Hardening                       |
| UX-02    | 34      | Update UX Hardening                       |
| UX-03    | 34      | Update UX Hardening                       |
| UX-04    | 33      | Update Observability Surface              |
| REL-01   | 32      | Pre-Update Sanity & Auto-Rollback         |
| REL-02   | 32      | Pre-Update Sanity & Auto-Rollback         |
| OBS-01   | 33      | Update Observability Surface              |
| OBS-02   | 33      | Update Observability Surface              |
| OBS-03   | 33      | Update Observability Surface              |

**Phase coverage summary:**

| Phase | Requirements                            | Count |
|-------|-----------------------------------------|-------|
| 31    | BUILD-01, BUILD-02, BUILD-03            | 3     |
| 32    | REL-01, REL-02                          | 2     |
| 33    | OBS-01, OBS-02, OBS-03, UX-04           | 4     |
| 34    | UX-01, UX-02, UX-03                     | 3     |
| 35    | BUILD-04                                | 1     |
| **Total** |                                     | **13** |
