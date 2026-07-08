// Hero — atmospheric headline + glassy OS window mockup
const { useState: useStateH, useEffect: useEffectH } = React;

// "do" flickers through 15 different style/color/decoration combos every 400ms
const DO_STYLES = [
  { f: "'Playfair Display', serif",   w: 700, i: true  },
  { f: "'Cormorant Garamond', serif", w: 500, i: true  },
  { f: "'Instrument Serif', serif",   w: 400, i: true  },
  { f: "'EB Garamond', serif",        w: 500, i: true  },
  { f: "'Fraunces', serif",           w: 500, i: true  },
  { f: "'Italiana', serif",           w: 400, i: false },
  { f: "'DM Serif Display', serif",   w: 400, i: true  },
];
const DoFlicker = () => {
  const [i, setI] = useStateH(0);
  useEffectH(() => {
    const t = setInterval(() => setI(v => (v + 1) % DO_STYLES.length), 1400);
    return () => clearInterval(t);
  }, []);
  const s = DO_STYLES[i];
  return (
    <em className="do-flick">
      <span key={i} style={{
        fontFamily: s.f,
        fontWeight: s.w,
        fontStyle: s.i ? "italic" : "normal",
      }}>do</span>
    </em>
  );
};

const Hero = () => {
  useEffectH(() => {
    const t = setTimeout(() => {
      document.querySelector(".hero .display")?.classList.add("entered");
    }, 5200);
    const ev = document.querySelector(".hero .everything-vid");
    const onScroll = () => {
      const y = window.scrollY || 0;
      // 0..1 over first ~600px of scroll; clamps
      const k = Math.max(0, Math.min(1, y / 150));
      if (ev) ev.style.setProperty("--ev-scroll", k.toFixed(3));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, []);
  return (
  <section className="hero">
    <div className="hero-bg-orb" aria-hidden="true" style={{display: "none"}}></div>
    <div className="hero-grid-bg" aria-hidden="true" style={{display: "none"}}></div>
    <HeroAtmosphere />
    <div className="container hero-inner">
      <div className="hero-top">
        <h1 className="display">
          <span className="type-line"><span className="your-reveal">Your</span> <span className="type-computer"><span className="tc-inner">computer.</span></span></span><br/>
          <span className="everything-vid everything-reveal" role="img" aria-label="Everything">
            <span className="ev-layout" aria-hidden="true">Everything</span>
            <video className="ev-video" autoPlay muted loop playsInline preload="auto"
                   ref={el => { if (el) el.playbackRate = 1.2; }}
                   onLoadedMetadata={e => { e.currentTarget.playbackRate = 1.2; }}>
              <source src="everything.mp4" type="video/mp4"/>
            </video>
            <svg className="ev-mask" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <mask id="evTextMask">
                  <rect width="100%" height="100%" fill="white"/>
                  <text x="500" y="120" textAnchor="middle" dominantBaseline="middle"
                        fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
                        fontWeight="800" fontSize="200" letterSpacing="-6"
                        textLength="980" lengthAdjust="spacingAndGlyphs"
                        fill="black">Everything</text>
                </mask>
              </defs>
              <rect className="ev-cover" width="100%" height="100%" mask="url(#evTextMask)"/>
            </svg>
          </span><br/>
          <span className="you-do-reveal"><span className="thin">you</span> do.</span>
        </h1>
        <p className="lede">
          Livinity is a Cloud AI Computer. One operating system, one quiet interface, and one assistant named Liv that understands what you ask and gets it done. Designed to be the simplest powerful computer you'll ever sign in to.
        </p>
        <div className="hero-ctas">
          <a className="btn btn-primary" href="#install">Install Now</a>
          <a className="btn btn-ghost" href="#liv">Learn more <Icon name="arrow-right" size={14}/></a>
        </div>

        <div className="hero-stats">
          <div className="col">
            <div className="stat-num">Liv<em>OS</em></div>
            <div className="stat-lbl">for everything you do</div>
          </div>
          <div className="col">
            <div className="stat-num">217<em> apps</em></div>
            <div className="stat-lbl">installed in a tap</div>
          </div>
          <div className="col">
            <div className="stat-num">Liv<em>, your AI</em></div>
            <div className="stat-lbl">always at hand</div>
          </div>
          <div className="col">
            <div className="stat-num">L<em>·</em>use</div>
            <div className="stat-lbl">Liv learns by watching</div>
          </div>
        </div>
      </div>

    </div>
  </section>
  );
};

// Hero atmosphere — animated purple field inspired by huly.io
//   · a slow-breathing core glow
//   · concentric ripples emanating outward on a long loop
//   · a perspective horizon grid receding into the distance
//   · embers drifting upward through the scene
const HeroAtmosphere = () => {
  // deterministic particle field
  const particles = React.useMemo(() => Array.from({length: 28}, (_, i) => {
    const rand = (n) => ((Math.sin(i * 12.9898 + n * 78.233) + 1) / 2);
    return {
      left: rand(1) * 100,
      size: 1.5 + rand(2) * 2.5,
      delay: rand(3) * -22,
      dur: 14 + rand(4) * 16,
      opacity: 0.25 + rand(5) * 0.55,
      drift: (rand(6) - 0.5) * 60,
    };
  }), []);

  return (
    <div className="hero-fx" aria-hidden="true">
      {/* perspective horizon grid */}
      <svg className="hero-fx__grid" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="lineFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="oklch(0.62 0.24 295)" stopOpacity="0"/>
            <stop offset="55%"  stopColor="oklch(0.65 0.28 300)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="oklch(0.7 0.30 305)"  stopOpacity="0.65"/>
          </linearGradient>
          <radialGradient id="gridMask" cx="50%" cy="100%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1"/>
            <stop offset="80%" stopColor="#fff" stopOpacity="0"/>
          </radialGradient>
          <mask id="gridFade">
            <rect width="1600" height="700" fill="url(#gridMask)"/>
          </mask>
        </defs>
        <g mask="url(#gridFade)" stroke="url(#lineFade)" strokeWidth="1" fill="none">
          {/* vanishing-point radial lines */}
          {Array.from({length: 19}).map((_, i) => {
            const angle = (Math.PI / 18) * i;
            const x2 = 800 + Math.cos(angle) * 2200;
            const y2 = 700 - Math.sin(angle) * 2200;
            return <line key={i} x1="800" y1="700" x2={x2} y2={y2}/>;
          })}
          {/* horizontal rings */}
          {[120, 220, 340, 480, 640].map((r, i) => (
            <ellipse key={i} cx="800" cy="700" rx={r * 2.6} ry={r}
              stroke="url(#lineFade)" strokeWidth="1" fill="none"/>
          ))}
        </g>
      </svg>

      {/* the Livinity mark — the ripples and ember come FROM it */}
      <div className="hero-fx__brand" aria-hidden="true">
        <span className="hero-fx__brand-mark"></span>
        <span className="hero-fx__brand-pulse"></span>
        <span className="hero-fx__brand-pulse" style={{animationDelay: "1s"}}></span>
      </div>

      {/* concentric ripples emanating from the brand */}
      <div className="hero-fx__ripples">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className="hero-fx__ripple" style={{animationDelay: `${i * 2.2}s`}}/>
        ))}
      </div>

      {/* the breathing core */}
      <div className="hero-fx__core"/>
      <div className="hero-fx__core-inner"/>

      {/* embers drifting up */}
      <div className="hero-fx__embers">
        {particles.map((p, i) => (
          <span key={i} className="ember" style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            "--drift": `${p.drift}px`,
          }}/>
        ))}
      </div>

      {/* soft top sheen */}
      <div className="hero-fx__sheen"/>
    </div>
  );
};

Object.assign(window, { HeroAtmosphere });
