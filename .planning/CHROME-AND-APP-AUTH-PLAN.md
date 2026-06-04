# Plan — Chrome Konsolidasyonu + Gated-App Auth Düzeltmesi

**Oluşturuldu:** 2026-06-04
**Bağlam:** Operatör Mini PC'de "2 Chrome / 2 profil" + "app'e tıklayınca `bruce.livinity.io`'ya redirect" sorunlarını bildirdi. İnceleme canlı Mini PC (`100.112.68.1`) + kaynak üzerinden yapıldı.

---

## İki AYRI iş var

1. **Gated-app auth redirect bug** (yüksek öncelik — canlı fonksiyonel regresyon).
2. **Chrome konsolidasyonu** (tek Chrome / tek profil + WebApp-stream Chrome iyileştirmesi).

---

## SORUN 1 — Gated app'e tıklayınca `bruce.livinity.io`'ya redirect

### Kök neden (KESİN — kanıtlandı)
`user/routes.ts:206-221` (Phase **257-04 / LIVOS-023**): `LIVINITY_SESSION` cookie'si bilinçli **host-only** yapıldı (`domain` attribute'u düşürüldü). Gerekçe güvenlik: geniş `.livinity.io` cookie'si session JWT'yi **paylaşılan platforma** (`livinity.io`, `apps.livinity.io`) ve **diğer kiracılara** sızdırıyordu.

AMA `/auth/verify` forward_auth gate'i (`server/index.ts:1188-1205`) hâlâ **cookie'nin `<app>-bruce.livinity.io`'ya ulaşmasına** bağımlı (`token = request.cookies?.LIVINITY_SESSION`). Host-only cookie **kardeş** subdomain'e (`bruce.livinity.io` ≠ `n8n-bruce.livinity.io`, ikisi de `livinity.io` altında kardeş) gönderilmez → forward_auth 401 → Caddy `redir https://bruce.livinity.io/login?redirect=...`.

**Sonuç:** 257-04'ün güvenlik düzeltmesi gated-app tarayıcı erişimini kırdı. Public app'ler (n8n — bu oturumda public yaptık) forward_auth'u atladığı için çalışıyor; **tüm gated app'ler** (immich, adguard, open-webui…) login'e bounce ediyor — operatör LivOS'a giriş yapmış olsa bile.

257-04'ün yorumu ("cross-subdomain app auth forward_auth ile çözülüyor") eksik: forward_auth'un cookie dışında session'ı görme yolu yok.

### Çözüm seçenekleri
- **Seçenek A — Cross-subdomain SSO bounce (ÖNERİLEN, paylaşılan relay için tek doğru yol).**
  Gated `<app>-<user>.livinity.io` 401 olduğunda login yerine bir SSO el sıkışmasına yönlendir:
  1. App subdomain forward_auth 401 → `https://<user>.livinity.io/__livos_sso?return=<app-url>`'e redirect (bu host'a parent cookie GÖNDERİLİR).
  2. `<user>.livinity.io` geçerli session'ı doğrular → kısa ömürlü (≤30 sn), tek kullanımlık, imzalı bir SSO token üretir → `https://<app>-<user>.livinity.io/__livos_auth?t=<token>`'e redirect.
  3. App subdomain'deki `/__livos_auth` (livinityd :8080, relay üzerinden aynı Mini PC'ye iner) token'ı doğrular → **o subdomain'e HOST-SCOPED** `LIVINITY_SESSION` cookie set eder → app'e redirect.
  4. Artık forward_auth o subdomain'de cookie'yi görür → 200. Her app subdomain'i kendi host-only cookie'sini alır → **çapraz-kiracı sızıntı YOK** (257-04 güvenliği korunur).
  - Maliyet: livinityd'de 2 yeni endpoint (`/__livos_sso`, `/__livos_auth`) + kısa-ömürlü token imzala/doğrula + Caddy gated-blok 401 redirect'ini login yerine `/__livos_sso`'ya çevir. Orta büyüklük, iyi sınırlı.
- **Seçenek B — Sahip olunan domainlerde cookie'yi `.<domain>`'e genişlet.**
  Domain paylaşılan `livinity.io` relay'i DEĞİLSE (operatörün kendi domaini, ör. `livinity.live` veya custom), `.<domain>` tek kiracı olduğu için güvenli. `livos:domain:config`'ten domain oku; relay-değilse genişlet. `bruce.livinity.io` için geçerli değil ama custom-domain kullanıcılarını tek satırla çözer.
- **Önerilen: A + B birlikte.** Paylaşılan relay → A; sahip olunan domain → B (daha basit yol).
- ~~Seçenek C — cookie'yi tekrar `.livinity.io`'ya genişlet~~ → REDDEDİLDİ (LIVOS-023 sızıntısını geri açar).

### Doğrulama (canlı)
`curl -L https://immich-bruce.livinity.io/` → giriş yapılmış oturumda app'in kendisi (200), `bruce.livinity.io/login` DEĞİL. Public olmayan app yine de oturumsuz erişimde gated kalmalı.

---

## SORUN 2 — Chrome konsolidasyonu

### Mevcut durum (canlı, kanıtlandı)
- Boot'ta **tek** Chrome çalışıyor: `:1`, profil `/home/bruce/.config/livos-chrome` (**4.4 GB**, Google login'li, CDP 9222). XFCE masaüstü popover'ında görünen bu.
- **"2. Chrome / 2. profil" kaynağı:** XFCE dock'undaki Chrome ikonu sistemin standart `google-chrome.desktop`'unu kullanıyor (`shell/xfce-shell.ts:58`, `--user-data-dir` YOK) → tıklayınca **default `google-chrome` profiliyle (29 MB) ayrı bir Chrome** açıyor. İki profil dizininin sebebi bu.
- **WebApp-stream sistemi (Phase 102):** link eklenen web uygulamaları için app başına: Xvfb `:N` + fluxbox + **master profil kopyası** (`cp -r /opt/livos/data/chrome-master → /tmp/livos-chrome-app-<uuid>`, ~200 MB, kapanınca silinir) + ayrı Chrome + x11vnc stream. AKTİF kullanılıyor (emekliye AYRILMAYACAK — iyileştirilecek).
  - Sıkıntılar: (i) her açılışta 200 MB cp → yavaş + disk churn; (ii) **profiller tek-seferlik** → bir sitede webapp içinde login olunca kapanınca kayboluyor; (iii) login, klon anındaki master'a donuk; (iv) Singleton* lock temizliği kırılgan.

### Çözüm
- **2a — XFCE dock Chrome'unu birleştir (HIZLI KAZANIM).**
  Dock launcher-2'nin `.desktop`'unu, boot Chrome ile **aynı profil + bayraklar**la özel bir `.desktop`'a çevir: `Exec=google-chrome --user-data-dir=/home/bruce/.config/livos-chrome --no-first-run --no-default-browser-check ...`. O zaman masaüstü Chrome ikonuna tıklayınca Chrome process-singleton'ı sayesinde **aynı tek instance'da yeni pencere/sekme** açılır → tek Chrome, tek profil, tek Google login. İkinci Chrome/profil biter.
  - `xfce-shell.ts`'te `DOCK_LAUNCHERS` chrome girdisini, seed edilen özel `.desktop`'a işaret edecek şekilde değiştir; seed adımı bu dosyayı `~/.config/xfce4/panel/launcher-2/`'ye yazsın.
  - Opsiyonel temizlik: atıl `~/.config/google-chrome` default profilini sil.
- **2b — WebApp-stream profil modelini iyileştir.**
  Tek-seferlik `/tmp/<uuid>` klonu yerine **domain-bazlı kalıcı profil**: `/opt/livos/data/chrome-webapps/<sanitized-domain>/`. İlk açılışta master'dan seed et (veya boş başla), sonra **yeniden kullan** → login'ler kalıcı, her açılışta 200 MB cp yok. Singleton* temizliği her açılışta yine yapılır (Xvfb display başına ayrı süreç gerektiği için per-process/per-profile zorunlu — bu mimari kısıt streaming modeli için kalır).
  - `profile-seeder.ts`: `seed({uuid})` → `seed({domainKey})`; var olan dizini koru, yoksa seed et. `window-manager.ts close()` artık profili SİLMESİN (kalıcılık). Disk büyümesini sınırla: LRU/yaş-bazlı budama (opsiyonel, ayrı görev).
  - Opsiyonel ileri adım: masaüstü `livos-chrome` profilini WebApp master'ı yap (tek Google login her yerde paylaşılsın) — ama singleton-lock yüzünden masaüstü Chrome açıkken aynı profili per-app süreçte AÇAMAYIZ; bu yüzden ayrı kalıcı kopyalar pragmatik kalır. Login senkronu için ayrı değerlendirme.

---

## Önerilen sıra / öncelik
1. **Sorun 1 (auth redirect)** — canlı regresyon, tüm gated app'leri etkiliyor. Önce bu. (Seçenek A + B.)
2. **Sorun 2a (dock Chrome birleştirme)** — küçük, görünür "2 Chrome" şikâyetini kapatır.
3. **Sorun 2b (WebApp profil kalıcılığı)** — orta, kalite/performans iyileştirmesi.

## Dokunulacak yerler
- Sorun 1: `livos/packages/livinityd/source/modules/server/index.ts` (yeni `/__livos_sso` + `/__livos_auth` endpoint'leri), `modules/user/routes.ts` (cookie domain mantığı, B), `modules/domain/caddy.ts` (gated blok 401 redirect hedefi: `/login` → `/__livos_sso`).
- Sorun 2a: `livos/packages/livinityd/source/modules/shell/xfce-shell.ts` (dock launcher .desktop seed).
- Sorun 2b: `modules/chrome-master/profile-seeder.ts`, `modules/webapps/window-manager.ts` (seed/cleanup lifecycle).

## Notlar
- Hepsi tek-kullanıcı Mini PC için; multi-user yolu ayrı değerlendirilir (257-04 zaten host-only'i multi-user güvenliği için getirmişti — SSO el sıkışması her iki modda da doğru çalışır).
- Sorun 1 deploy sonrası MUTLAKA canlı doğrulanmalı (gated app → 200, oturumsuz → hâlâ gated).
