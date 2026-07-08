// Root app + Tweaks
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "spacious"
}/*EDITMODE-END*/;

// Apply tweaks — Apple-clean: light/dark + density only
const applyTweaks = (t) => {
  document.body.classList.toggle("dark", t.theme === "dark");

  const dens = {
    cozy: "clamp(64px, 8vw, 120px)",
    spacious: "clamp(96px, 12vw, 180px)",
    airy: "clamp(128px, 16vw, 220px)",
  };
  document.querySelectorAll(".section").forEach(s => {
    s.style.paddingTop = dens[t.density] || dens.spacious;
    s.style.paddingBottom = dens[t.density] || dens.spacious;
  });
};

const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffectA(() => { applyTweaks(t); }, [t]);

  // Scroll-driven 3D recede on the "Everything" video
  useEffectA(() => {
    const el = document.querySelector(".everything-vid");
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // 0 when element fully in view, 1 when fully scrolled past top
        const startY = vh * 0.4; // start receding when element top crosses 40% of viewport
        const dist = Math.max(0, startY - rect.top);
        const p = Math.min(1, dist / (startY + rect.height));
        el.style.setProperty("--ev-scroll", p.toFixed(3));
        el.classList.toggle("scrolled", p > 0.001);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal-on-scroll for the alternating walkthrough rows (progressive enhancement:
  // the .js-reveal class gates the hidden state, so without JS everything stays visible).
  useEffectA(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const rows = Array.from(document.querySelectorAll(".walk-row"));
    if (!rows.length || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js-reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    rows.forEach((r) => io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Walkthrough />
        <DockerShowcase />
        <AppsMarquee />
        <Install />
        <Paths />
        <FAQ />
      </main>
      <Footer />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakRadio
          label="Theme"
          value={t.theme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark",  label: "Dark" },
          ]}
          onChange={(v) => setTweak("theme", v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={[
            { value: "cozy",     label: "Cozy" },
            { value: "spacious", label: "Spacious" },
            { value: "airy",     label: "Airy" },
          ]}
          onChange={(v) => setTweak("density", v)}
        />
      </TweaksPanel>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
