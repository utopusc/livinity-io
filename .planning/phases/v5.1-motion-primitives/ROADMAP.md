# v5.1 Motion Primitives Integration — Roadmap

## Vision
Transform LivOS from a functional OS into a **living, breathing premium interface**.
Every interaction should feel physical, delightful, and intentional.
White-on-white professional palette. Apple-level polish.

## Color Strategy
- Primary surfaces: `bg-white`, `bg-white/95`, `bg-white/90`
- Cards: `bg-white` with `shadow-elevation-sm` + `border border-border-subtle`
- Floating elements: `bg-white/80 backdrop-blur-xl`
- Accent: Brand blue (only on CTAs and active states)
- Text: `text-text-primary` on white, minimal use of color
- No gradients on surfaces — flat white, depth via shadows only

---

## Phase 01: Foundation — Install Dependencies + Add Core Components
- Install `react-use-measure` (needed by 4+ components)
- Add motion-primitives components via CLI or manual copy:
  - MorphingDialog, TextShimmer, TextEffect, TextMorph, TextLoop
  - TextScramble, TextShimmerWave, AnimatedNumber, SlidingNumber
  - Tilt, Spotlight, Magnetic, ProgressiveBlur, InfiniteSlider
  - BorderTrail (already exists), GlowEffect (already exists)
  - AnimatedGroup (already exists), TransitionPanel (already exists)
  - AnimatedBackground, Accordion, Disclosure, Carousel
  - MorphingPopover, ToolbarExpandable, ScrollProgress, InView
  - ImageComparison, Cursor, SpinningText

## Phase 02: MorphingDialog — Window Open/Close Morph (USER PRIORITY)
- Dock icon click -> window morphs FROM the icon position
- Window close -> morphs BACK to the dock icon
- layoutId shared between dock icon and window frame
- Spring physics: bounce 0.15, duration 0.5
- Fallback: if no dock icon (e.g. deep link), use scale+fade

## Phase 03: Desktop — Canlı Masaustu
- "Good afternoon, Burak." -> TextShimmerWave (dalga efekti ile her harf parlar)
- App icons grid entrance -> AnimatedGroup (zoom preset, stagger 50ms)
- App icon hover -> Tilt (rotationFactor: 8, subtle 3D tilt)
- Search button -> MorphingPopover (arama ikonu -> tam arama paneline morph)
- Paginator pills -> AnimatedBackground (aktif pill kayarak geçer)
- Desktop clock widget (future) -> SlidingNumber

## Phase 04: AI Chat — Zeki Hissettiren Sohbet
- "Liv is thinking..." -> TextShimmer (shimmer döngüsü)
- AI streaming response -> TextEffect (per-word, fade-in-blur preset)
- Chat input placeholder -> TextLoop (dönen öneriler: "Sistem sağlığını kontrol et...", "Docker konteynerlerini listele...", "Hafızada ne var?...")
- Chat input active/processing -> BorderTrail (enerji çizgisi kenar boyunca döner)
- Send button with text -> GlowEffect (breathe mode, brand rengi)
- Token count display -> AnimatedNumber (smooth geçiş)
- MCP tool call names -> TextScramble (hacker estetiği, isim scramble edilip çözülür)

## Phase 05: App Store — Premium Vitrin
- Hero/featured app cards -> Tilt + Spotlight (3D tilt + cursor ışık takibi)
- App card -> detail page -> MorphingDialog (kart detay sayfasına morph olur)
- Featured apps banner -> InfiniteSlider (otomatik kayan uygulama şeridi)
- App screenshots -> Carousel (sürüklenebilir ekran görüntüleri)
- Category tabs -> AnimatedBackground (seçili kategori kayarak geçer)
- App install progress -> BorderTrail (kart kenarında ilerleme)
- "New" / "Popular" badges -> GlowEffect (pulse mode, dikkat çeker)

## Phase 06: Settings — Akışkan Navigasyon
- Sidebar navigation -> AnimatedBackground (seçili item arka planı kayar)
- Content panel switch -> TransitionPanel (yönlü slide geçiş)
- Settings sections -> Accordion (gruplar açılır/kapanır)
- Individual setting rows -> Disclosure (detay paneli genişler)
- Scroll sections -> InView (bölümler görünüme girince animate)
- Device info stats -> AnimatedNumber (CPU%, RAM, uptime)
- Uptime counter -> SlidingNumber (mekanik sayaç efekti)

## Phase 07: File Manager — Canlı Dosya Yönetimi
- File grid/list entrance -> AnimatedGroup (blur-slide preset)
- Scroll edges -> ProgressiveBlur (üst/alt kenarlar nazik blur fade)
- Long list scroll -> ScrollProgress (ince ilerleme çubuğu)
- File thumbnail -> lightbox -> MorphingDialog (küçük resim büyür)
- Toolbar search -> MorphingPopover (arama ikonu -> arama alanı morph)
- File size changes -> AnimatedNumber
- Upload progress -> BorderTrail (dosya kartı kenarı)

## Phase 08: Window System — Profesyonel Pencere Yönetimi
- Window title text -> TextMorph (sayfa değişince harfler morph olur)
- Window close button -> Magnetic (mouse yaklaşınca hafif çekilir)
- Window chrome title pill -> AnimatedBackground (etiket geçişi)
- Active window -> subtle BorderTrail (focused pencere kenarında enerji)
- Window content tabs -> TransitionPanel

## Phase 09: Notifications & Toasts — Hayat Bulan Bildirimler
- Toast entrance -> TextEffect (per-word fade-in)
- Notification list -> AnimatedGroup (stagger entrance)
- Notification badge counter -> SlidingNumber (sayı kayar)
- Notification expand -> Disclosure (detay açılır)

## Phase 10: System-Wide Polish
- All button hover states -> subtle Magnetic (1-2px attraction)
- Loading spinners -> SpinningText (branded "LivOS" circular text)
- All stat counters -> AnimatedNumber (usage, storage, uptime)
- Onboarding wizard -> Carousel + TextEffect step titles
- Login page greeting -> TextShimmerWave
- Error states -> TextScramble (hata metni scramble efekti)
- Empty states -> TextEffect (fade-in-blur for "No items" messages)

---

## Success Criteria
- Every screen has at least 2 motion-primitives
- No jarring instant transitions — everything animates
- Consistent spring physics across all animations
- Performance: no frame drops on mid-range devices
- Professional white-on-white palette throughout
