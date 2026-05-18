# RESUME PROMPT — paste this after `/clear`

```
Phase 144 fresh-install UAT'yi başlatıyoruz. Mini PC tabula rasa
durumunda — bir önceki session'da tam wipe yapıldı (LivOS + Claude
state + Chrome profiller + tüm cache). Server5 + Cloudflare tarafı
ise kasıtlı olarak korundu (re-install regression testi için).

Önce sıralı oku:
1) .planning/phases/144-fresh-install-uat/MINI-PC-ZERO-STATE.md
   (neyin silindi + neyin korundu + verified-clean snapshot)
2) .planning/phases/144-fresh-install-uat/UAT-PLAN.md
   (12 section, ~30dk full pass, her section copy-paste komut + expected)
3) MEMORY.md zaten yüklü. Tekrar gözden geçirilecekler:
   - reference_minipc.md / reference_minipc_ssh.md
   - feedback_install_sh_systemd_token_cache_bug
   - feedback_pm2_reload_ecosystem
   - feedback_minipc_factory_reset_checklist

Mevcut repo durumu:
- HEAD: 7b0d11e7 (Phase 143 portal-rename) shipped + pushed
- Phase 141 + 142 + 143 hepsi CODE-COMPLETE
- Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
- Phase 144 = bu UAT (henüz başlamadı)

Live state:
- Mini PC: tabula rasa (servisler not-found, /opt/livos yok, PG empty)
- Server5: socinity user + CF tunnel 633ab1f5 hâlâ aktif
- API key: liv_k_phase140socinityRESET12 (Server5 api_keys'te hashed)

Fresh install komutu (Section B1):
  ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc \
      -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
      'curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
           --subdomain socinity --api-key liv_k_phase140socinityRESET12 \
           2>&1 | tee /tmp/install-144.log | tail -30'

Çalış sırası (UAT-PLAN.md'deki section'ları takip et):
  A → B → C → D → E → F → G → H → I → J → K → L
  (J KNOWN-FAIL section, beklenen; carryover olarak Phase 144 SUMMARY'ye düşecek)

UAT-REPORT.md'yi sıfırdan başlat (template UAT-PLAN.md sonunda hazır).
Her section'ı yürütürken PASS/FAIL işaretle + bir cümle not düş.

Önemli kurallar:
- Mini PC'ye gönderilen her komut tek SSH session'da batch'lensin
  (rate limit + ZeroTier instability için).
- "ZeroTier dropped" → retry 15-20s sonra, panik yok.
- Her plan sonrası ek smoke-test trio: apex + /trpc + (app-)socinity URL.
- Sacred SHA her commit'te korunmalı.
- Status update'leri Türkçe (komutlar İngilizce).

GSD autonomous mode'da çalış. Operator gate'leri atla — autonomous
tercih edildi. UAT'i baştan sona yürüt + report'u doldur + Phase 144
SUMMARY.md yaz. Sonra Phase 145 carryover phase'ini (update.sh'in
scripts/install/ rsync'i + UAT'te surface olan herhangi bir bug) plana
çevir.

Başla.
```

---

## Why this prompt works

- **Self-contained:** lists files to read in order with full paths
- **Live state explicit:** Mini PC zero / Server5 intact — no assumption
  about what's where
- **Test script ready-to-paste:** the install command + the section walk-order
- **Failure-tolerant:** ZeroTier instability + section-by-section gates
- **Carryover path defined:** Section J known-fail surfaces Phase 145
- **Language preferences preserved:** Turkish status, English commands

## What survives `/clear`

- `MEMORY.md` auto-loaded
- `.planning/` directory contents (this entire phase folder + ROADMAP.md)
- Git repo on disk (HEAD at 7b0d11e7)
- Mini PC live state (tabula rasa) + Server5 live state (socinity intact)
- `/tmp/mini-pc-full-wipe.sh` on Mini PC (re-wipe script if UAT needs to restart)

## What gets lost

- This conversation thread (the wipe + plan-write trail)
- In-memory task list
- Any uncommitted experiment files (none in this case)
