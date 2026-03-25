# v15.0 — AI Computer Use (Claude Computer Use Style)

## Vision

AI sadece komut çalıştırmıyor — ekranı görüyor, tıklıyor, yazıyor. Kullanıcı "Chrome'u aç ve YouTube'da müzik aç" dediğinde AI:
1. Screenshot alır → ekranı analiz eder
2. Chrome ikonunu bulur → koordinatlara tıklar
3. URL bar'a tıklar → "youtube.com" yazar
4. Arama kutusuna tıklar → müzik arar
5. İlk sonuca tıklar

## Teknik Yaklaşım

### Agent Tarafı (Electron app'e eklenir)
- **screenshot** tool zaten var → AI ekranı görebilir
- **mouse_click(x, y)** — yeni tool: belirtilen koordinata tıklar
- **mouse_double_click(x, y)** — çift tıklama
- **mouse_right_click(x, y)** — sağ tıklama
- **keyboard_type(text)** — klavye ile metin yazar
- **keyboard_press(key)** — özel tuş basar (Enter, Tab, Escape, ctrl+c, vb.)
- **mouse_move(x, y)** — fare hareket ettirir
- **mouse_drag(x1, y1, x2, y2)** — sürükle bırak
- **get_screen_size()** — ekran çözünürlüğünü döner

### Nasıl Çalışır
1. AI screenshot tool'u çağırır → JPEG alır
2. AI görüntüyü analiz eder (multimodal LLM — Kimi veya Claude)
3. AI tıklanacak koordinatı belirler
4. AI mouse_click(x, y) tool'unu çağırır
5. Tekrar screenshot → doğrula → devam et

### Windows Implementasyonu
- **robotjs** veya **nutjs** (nut.js) — cross-platform mouse/keyboard automation
- `@nut-tree/nut-js` — TypeScript native, screenshot + mouse + keyboard
- Electron main process'te çalışır (renderer'da değil — güvenlik)

### Güvenlik
- Kullanıcı onayı: "AI ekranınızı kontrol etmek istiyor. İzin veriyor musunuz?"
- Activity log'da her tıklama/yazma kaydedilir
- Emergency stop: Escape tuşuna 3 kez basılırsa AI kontrolü durur
- Sadece belirli uygulamalar için izin verilebilir (v15.1)

### Gerekli Değişiklikler
1. Agent-app'e yeni tool'lar ekle (mouse_click, keyboard_type, vb.)
2. nut.js veya robotjs dependency ekle
3. Nexus AI'a "computer use" modu ekle — screenshot → analiz → action döngüsü
4. LivOS UI'da computer use oturumunu izleme (live screenshot stream)
5. Güvenlik: onay dialogu, emergency stop, audit log

## Phases (Tahmini)

1. **Mouse & Keyboard Tools** — Agent'a 8 yeni tool ekle (click, type, press, drag, etc.)
2. **Screenshot Loop** — AI'ın screenshot→analiz→action döngüsü (Nexus tarafı)
3. **Computer Use UI** — LivOS'ta live ekran izleme + kontrol paneli
4. **Security & Permissions** — Onay dialogu, emergency stop, izin sistemi
