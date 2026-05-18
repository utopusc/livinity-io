// Sections — Apple-clean monochrome, Cloud AI Computer language
const { useState: useStateS } = React;

const Features = () => (
  <section className="section" id="liv">
    <div className="container">
      <span className="eyebrow">A new kind of computer.</span>
      <h2 className="h2" style={{marginTop: 16, maxWidth: "22ch"}}>
        Designed to feel simple. Built to do anything.
      </h2>
      <p className="lede" style={{marginTop: 18}}>
        Livinity is the operating system. Liv is the assistant. Together they replace dozens of tools with one clean place to think, work, and live.
      </p>

      <div className="features">
        <div className="card span-7">
          <span className="num">Liv</span>
          <h3>An assistant that actually does the thing.</h3>
          <p>Ask in plain language. Liv understands, remembers, and takes action — moving files, planning your week, drafting replies. She works while you sleep.</p>
          <div className="fv fv-skills">
            <div className="skill-row"><Icon name="puzzle" size={14}/> plan.day <span className="tag">skill</span></div>
            <div className="skill-row"><Icon name="puzzle" size={14}/> compose.reply <span className="tag">skill</span></div>
            <div className="skill-row"><Icon name="puzzle" size={14}/> files.sort <span className="tag">skill</span></div>
            <div className="skill-row"><Icon name="puzzle" size={14}/> memory.recall <span className="tag">core</span></div>
            <div className="skill-row"><Icon name="puzzle" size={14}/> notify.me <span className="tag">i/o</span></div>
            <div className="skill-row"><Icon name="puzzle" size={14}/> search.web <span className="tag">skill</span></div>
          </div>
        </div>

        <div className="card span-5">
          <span className="num">L<span style={{display: "inline-block", verticalAlign: "middle", margin: "0 2px", fontSize: "0.9em", lineHeight: 1}}>·</span>use</span>
          <h3>Teach Liv how you work. Then let it work.</h3>
          <p>Show Liv your browser, your apps, your shortcuts — once. It learns the flow, remembers the steps, and runs them on its own next time. Your computer, on autopilot when you want it.</p>
          <div className="fv fv-luse">
            <div className="luse-browser" aria-hidden="true">
              <div className="luse-bar">
                <span></span><span></span><span></span>
                <div className="luse-url">livinity.io/setup</div>
              </div>
              <div className="luse-stage">
                <div className="luse-card">
                  <div className="luse-card-title"></div>
                  <div className="luse-card-row r1"></div>
                  <div className="luse-card-row r2"></div>
                  <div className="luse-card-row r3"></div>
                </div>
                <div className="luse-btn t1">Skip</div>
                <div className="luse-btn t2">Connect account</div>
                <div className="luse-btn t3">Continue →</div>
                <div className="luse-cursor">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M3 2l6 16 2.5-6.5L18 9z"/>
                  </svg>
                </div>
                <div className="luse-ping p1"></div>
                <div className="luse-ping p2"></div>
                <div className="luse-ping p3"></div>
                <div className="luse-toast s1">Step 1 learned · Skip</div>
                <div className="luse-toast s2">Step 2 learned · Connect</div>
                <div className="luse-toast s3">Step 3 learned · Continue</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card span-5" id="developers">
          <span className="num">For builders</span>
          <h3>A computer with an open API.</h3>
          <p>One Model Context Protocol endpoint connects Liv to Claude, Cursor, and the tools you already write. Hot-reload skills in TypeScript. tRPC end-to-end.</p>
          <div className="fv fv-mcp">
            <div className="mcp-line"><span className="ts">22:14</span><span>cursor → liv</span></div>
            <div className="mcp-line in">  → tools.list</div>
            <div className="mcp-line out">  ← 47 tools registered</div>
            <div className="mcp-line in">  → files.read("notes/Q1.md")</div>
            <div className="mcp-line out">  ← 4.2 KB delivered</div>
            <div className="mcp-line in">  → app.run("studio")</div>
            <div className="mcp-line out">  ← started in 1.3s</div>
          </div>
        </div>

        <div className="card span-7">
          <span className="num">Everywhere</span>
          <h3>Liv is wherever you are.</h3>
          <p>WhatsApp at lunch. Telegram on the train. Discord with your team. The web at your desk. Claude or Cursor while you build — one assistant, one memory, every surface.</p>
          <div className="channels">
            {[
              {n:"WhatsApp", ic:"whatsapp", sub:"Chat with Liv like a friend",     hue:"#25D366"},
              {n:"Telegram", ic:"telegram", sub:"Quick commands, instant replies",  hue:"#229ED9"},
              {n:"Discord",  ic:"discord",  sub:"Bring Liv into your server",       hue:"#5865F2"},
              {n:"Web",      ic:"globe",    sub:"Your computer in any browser",     hue:"#9aa0aa"},
              {n:"Claude · Cursor", ic:"claude", sub:"MCP, native to your IDE",     hue:"#D97757", wide:true},
            ].map((c,i)=>(
              <a key={i} href="#" className={"channel" + (c.wide ? " wide" : "")}>
                <span className="ch-ic" style={{background: c.hue}}><Icon name={c.ic} size={16}/></span>
                <span className="ch-meta">
                  <span className="ch-n">{c.n}</span>
                  <span className="ch-sub">{c.sub}</span>
                </span>
                <span className="ch-arr"><Icon name="arrow-up-right" size={14}/></span>
              </a>
            ))}
          </div>
        </div>

        <div className="card span-4">
          <span className="num">Stack</span>
          <h3>Five layers, one computer.</h3>
          <div className="stack-diagram in-card" aria-label="Livinity stack">
            <div className="stack-row">
              <div className="stack-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg></div>
              <div className="stack-body"><div className="stack-name">Browser</div><div className="stack-desc">any device, any tab</div></div>
            </div>
            <div className="stack-arrow"></div>
            <div className="stack-row">
              <div className="stack-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></div>
              <div className="stack-body"><div className="stack-name">Liv</div><div className="stack-desc">your AI, your keys</div></div>
            </div>
            <div className="stack-arrow"></div>
            <div className="stack-row">
              <div className="stack-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg></div>
              <div className="stack-body"><div className="stack-name">Apps</div><div className="stack-desc">200+ open-source</div></div>
            </div>
            <div className="stack-arrow"></div>
            <div className="stack-row">
              <div className="stack-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><ellipse cx="12" cy="5" rx="8" ry="2.4"/><path d="M4 5v6c0 1.3 3.6 2.4 8 2.4S20 12.3 20 11V5"/><path d="M4 11v6c0 1.3 3.6 2.4 8 2.4S20 18.3 20 17v-6"/></svg></div>
              <div className="stack-body"><div className="stack-name">Data</div><div className="stack-desc">encrypted, exportable</div></div>
            </div>
            <div className="stack-arrow"></div>
            <div className="stack-row">
              <div className="stack-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/><circle cx="7" cy="6.5" r="0.6" fill="currentColor"/><circle cx="7" cy="13.5" r="0.6" fill="currentColor"/></svg></div>
              <div className="stack-body"><div className="stack-name">Infra</div><div className="stack-desc">self-host · cloud</div></div>
            </div>
          </div>
        </div>
        <div className="card span-4">
          <span className="num">Apps</span>
          <h3>Everything you already use.</h3>
          <p>Two hundred carefully selected apps — files, photos, notes, mail, automation — preinstalled, polished, kept current.</p>
        </div>
        <div className="card span-4">
          <span className="num">Updates</span>
          <h3>Always the latest.</h3>
          <p>Livinity quietly keeps itself current overnight. You wake up to a better computer than you went to bed with.</p>
        </div>
      </div>
    </div>
  </section>
);

const APPS = [
  {n:"Files",   g:"F", cat:"Storage"},
  {n:"Photos",  g:"P", cat:"Media"},
  {n:"Mail",    g:"M", cat:"Comms"},
  {n:"Notes",   g:"N", cat:"Write"},
  {n:"Calendar",g:"C", cat:"Plan"},
  {n:"Music",   g:"♪", cat:"Media"},
  {n:"Studio",  g:"S", cat:"Create"},
  {n:"Drive",   g:"D", cat:"Storage"},
  {n:"Mind",    g:"◯", cat:"Think"},
  {n:"Pages",   g:"P", cat:"Write"},
  {n:"Sheets",  g:"#", cat:"Data"},
  {n:"Slides",  g:"▱", cat:"Present"},
  {n:"Vault",   g:"◆", cat:"Secure"},
  {n:"Sync",    g:"⇄", cat:"System"},
  {n:"Sites",   g:"§", cat:"Build"},
  {n:"Mailbox", g:"✉", cat:"Comms"},
  {n:"Reader",  g:"≡", cat:"Read"},
  {n:"Books",   g:"B", cat:"Read"},
  {n:"Library", g:"L", cat:"Read"},
  {n:"Lens",    g:"◉", cat:"Vision"},
  {n:"Home",    g:"⌂", cat:"System"},
  {n:"Gate",    g:"▤", cat:"Secure"},
  {n:"Buckets", g:"▢", cat:"Storage"},
  {n:"Journal", g:"J", cat:"Write"},
];

const SWAPS = [
  {paid: "Notion",        price: 20, free: "AppFlowy",    cat: "Docs · Wiki"},
  {paid: "Google Workspace", price: 18, free: "Nextcloud", cat: "Files · Mail"},
  {paid: "Dropbox",       price: 12, free: "Syncthing",   cat: "Backup"},
  {paid: "Spotify",       price: 12, free: "Navidrome",   cat: "Music"},
  {paid: "Netflix",       price: 18, free: "Jellyfin",    cat: "Video"},
  {paid: "Photoshop",     price: 23, free: "Photopea",    cat: "Design"},
  {paid: "Figma",         price: 15, free: "Penpot",      cat: "UI · Design"},
  {paid: "1Password",     price:  8, free: "Vaultwarden", cat: "Passwords"},
  {paid: "Zoom Pro",      price: 17, free: "Jitsi",       cat: "Meetings"},
  {paid: "Slack",         price: 14, free: "Mattermost",  cat: "Chat"},
  {paid: "Calendly",      price: 12, free: "Cal.com",     cat: "Scheduling"},
  {paid: "Mailchimp",     price: 22, free: "Listmonk",    cat: "Newsletters"},
  {paid: "ChatGPT Plus",  price: 20, free: "Open WebUI",  cat: "AI · Chat"},
  {paid: "GitHub Copilot",price: 19, free: "Continue",    cat: "AI · Code"},
  {paid: "Linear",        price: 10, free: "Plane",       cat: "Tasks"},
  {paid: "Airtable",      price: 20, free: "NocoDB",      cat: "Database"},
  {paid: "Evernote",      price: 14, free: "Joplin",      cat: "Notes"},
  {paid: "Squarespace",   price: 23, free: "Ghost",       cat: "Website"},
  {paid: "Adobe Premiere",price: 22, free: "DaVinci",     cat: "Video Edit"},
  {paid: "LastPass",      price:  6, free: "KeePassXC",   cat: "Passwords"},
];
const TOTAL_PAID = SWAPS.reduce((s, x) => s + x.price, 0);

const PayCounter = () => {
  const [count, setCount] = useStateS(TOTAL_PAID);
  React.useEffect(() => {
    let raf, t0, delay;
    const animate = () => {
      t0 = null;
      const tick = (t) => {
        if (!t0) t0 = t;
        const p = Math.min(1, (t - t0) / 4000);
        const eased = 1 - Math.pow(1 - p, 3);
        setCount(Math.round(TOTAL_PAID * (1 - eased)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(raf);
      delay = setTimeout(() => { raf = requestAnimationFrame(tick); }, 700);
    };
    const reset = () => { cancelAnimationFrame(raf); clearTimeout(delay); setCount(TOTAL_PAID); };
    const el = document.querySelector(".pay-counter");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) animate(); else reset();
    }, {threshold: 0.6});
    io.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);
  return <em className="pay-counter" style={{"--pp": (TOTAL_PAID ? (TOTAL_PAID - count) / TOTAL_PAID : 1)}}>${count}</em>;
};

const Savings = () => {
  const [count, setCount] = useStateS(0);
  React.useEffect(() => {
    let raf, t0;
    const tick = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / 1800);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(TOTAL_PAID * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { raf = requestAnimationFrame(tick); io.disconnect(); }
    }, {threshold: 0.3});
    const el = document.querySelector(".sub-savings");
    if (el) io.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);
  return (
    <div className="sub-savings">
      <div className="sub-line">
        <span className="sub-lbl">What you'd pay</span>
        <span className="sub-old">${count}<span className="mo">/mo</span></span>
        <span className="sub-arrow">→</span>
        <span className="sub-lbl">With LivOS</span>
        <span className="sub-new">$0<span className="mo">/mo</span></span>
      </div>
      <div className="sub-note"></div>
    </div>
  );
};

const AppsMarquee = () => {
  const [idx, setIdx] = useStateS(0);
  React.useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % SWAPS.length), 1600);
    return () => clearInterval(id);
  }, []);
  const cur = SWAPS[idx];
  return (
  <section className="section" id="apps">
    <div className="container">
      <div className="apps-head">
        <span className="eyebrow">Stop renting your tools.</span>
        <h2 className="h2" style={{marginTop: 16, maxWidth: "20ch"}}>
          Skip the subscription. Pay <PayCounter/>
        </h2>
        <p className="lede" style={{marginTop: 16, maxWidth: "58ch"}}>
          Every subscription has a free, open-source twin. LivOS installs them in one tap,
          publishes them on <em>your own domain</em>, and Liv manages everything by AI —
          updates, backups, settings. Anywhere you sign in.
        </p>
      </div>

      <div className="swap-stage">
        <div className="swap-marquee" aria-hidden="true">
          <div className="swap-marquee-track">
            {[...SWAPS, ...SWAPS].map((s, i) => (
              <span key={i} className="swap-chip">
                <span className="swap-chip-name">{s.paid}</span>
                <span className="swap-chip-price">${s.price}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="swap-hero compact">
          <div className="swap-hero-side paid">
            <div className="swap-hero-eyebrow">Paying for</div>
            <div className="swap-hero-name" key={"p"+idx}>{cur.paid}</div>
            <div className="swap-hero-meta">${cur.price}/mo</div>
          </div>
          <div className="swap-hero-arrow" aria-hidden="true">
            <svg viewBox="0 0 32 16" width="36" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8h26M22 2l6 6-6 6"/>
            </svg>
          </div>
          <div className="swap-hero-side free">
            <div className="swap-hero-eyebrow">On LivOS</div>
            <div className="swap-hero-name" key={"f"+idx}>{cur.free}</div>
            <div className="swap-hero-meta">Free · {cur.cat}</div>
          </div>
        </div>

        <Savings />
      </div>
    </div>
  </section>
  );
};

const Install = () => (
  <section className="section" id="install">
    <div className="container">
      <div className="install">
        <div className="install-grid">
          <div className="col" style={{gap: 20}}>
            <span className="eyebrow">Sign in.</span>
            <h2 className="h2" style={{maxWidth: "18ch"}}>
              Your computer is ready in 60 seconds.
            </h2>
            <p className="lede">
              Open Livinity in any browser. Sign in. That's it — your Cloud AI Computer is on, your apps are ready, and Liv is waiting to say hello.
            </p>
            <div className="row" style={{marginTop: 8}}>
              <a className="btn btn-primary" href="/login">Sign in to Livinity</a>
              <a className="btn btn-ghost" href="https://github.com/utopusc/livinity-io" target="_blank" rel="noreferrer">
                <Icon name="github" size={16}/> Open source
              </a>
            </div>
            <div className="row check-row" style={{marginTop: 22, color: "rgba(255,255,255,0.7)", fontSize: 13}}>
              <span><Icon name="check" size={14} stroke={2}/> Works in any browser</span>
              <span><Icon name="check" size={14} stroke={2}/> Bring your own AI keys</span>
              <span><Icon name="check" size={14} stroke={2}/> Free to start</span>
            </div>
          </div>
          <div className="terminal">
            <div className="terminal-bar"><span></span><span></span><span></span></div>
            <div className="terminal-body">
              <div><span className="com"># Or self-host. One line, any Linux.</span></div>
              <div><span className="prompt">$</span> curl -fsSL get.livinity.io | bash</div>
              <div className="com">  ↳ preparing your computer…</div>
              <div className="com">  ↳ installing apps… <span className="ok">done</span></div>
              <div className="com">  ↳ securing connection… <span className="ok">done</span></div>
              <div className="com">  ↳ waking Liv… <span className="ok">ready</span></div>
              <div style={{marginTop: 10}}><span className="prompt">→</span> open <span style={{color: "#fff"}}>livinity.io</span> <span className="cur"></span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Paths = () => (
  <section className="section" id="pricing">
    <div className="container">
      <span className="eyebrow">Pricing.</span>
      <h2 className="h2" style={{marginTop: 16, maxWidth: "22ch"}}>
        Choose how you want your computer.
      </h2>
      <p className="lede" style={{marginTop: 16, maxWidth: "58ch"}}>
        Two ways in. Run the full OS on your own hardware, or let us host a Cloud AI Computer you tune to the bone.
      </p>
      <div className="paths two">
        <div className="path-card">
          <span className="ribbon ghost">Open-source</span>
          <h4>Self-host</h4>
          <div className="price">Free<em> · forever</em></div>
          <p className="dim" style={{fontSize: 15}}>The complete OS on your own machine. One line, any Linux. Yours, end to end.</p>
          <ul>
            <li>The complete operating system</li>
            <li>Liv with vector memory</li>
            <li>All 200+ apps, no limits</li>
            <li>Open API for builders</li>
            <li>Community support</li>
          </ul>
          <a className="btn btn-ghost cta" href="#install">Self-host now <Icon name="arrow-right" size={14}/></a>
        </div>
        <div className="path-card feat">
          <span className="ribbon">Build yours</span>
          <h4>Customize</h4>
          <div className="price">from $37<em> /mo</em></div>
          <p className="dim" style={{fontSize: 15}}>A Cloud AI Computer tuned to you. Pick CPU, RAM, storage, GPU. We run it, you sign in.</p>
          <ul>
            <li>Pick CPU, RAM, storage and GPU</li>
            <li>Presets: Basic, Mid, Advanced</li>
            <li>Liv with your keys, your memory</li>
            <li>Automatic backups & updates</li>
            <li>Move to your own hardware anytime</li>
          </ul>
          <a className="btn btn-primary cta" href="customize.html">Configure your computer <Icon name="arrow-right" size={14}/></a>
        </div>
      </div>
    </div>
  </section>
);

const FAQ_ITEMS = [
  {q: "What is a Cloud AI Computer?", a: "A full computer — operating system, apps, assistant — that lives in the cloud and opens in your browser. No installs, no setup, no devices to worry about. Sign in and your computer is right there."},
  {q: "Is my data really mine?", a: "Yes. Everything Liv learns about you, every file, every chat, is encrypted and stored in your computer's space. Open source means anyone can verify there's no telemetry. You can move it to your own hardware whenever you like."},
  {q: "Which AI does Liv use?", a: "Bring your own. Liv works with Claude, Gemini, and local models. You choose. We never charge you for tokens — the keys are yours."},
  {q: "Can I use Livinity on my phone?", a: "Open it in any browser. Liv remembers your conversation between every screen — phone, laptop, tablet, IDE."},
  {q: "Do I have to be technical?", a: "No. The Cloud plan is one sign-in away. If you can use a website, you can use Livinity. Builders get an open API on top."},
  {q: "What if I want to leave?", a: "Export everything. Move to your own machine. Livinity is open source, so the door is always unlocked."},
];

const FAQ = () => {
  const [openIx, setOpenIx] = useStateS(0);
  return (
    <section className="section" id="faq">
      <div className="container">
        <span className="eyebrow">Questions.</span>
        <h2 className="h2" style={{marginTop: 16, maxWidth: "22ch"}}>The short answers.</h2>
        <div className="faq-list">
          {FAQ_ITEMS.map((it, i) => (
            <div key={i} className={"faq-item" + (openIx === i ? " open" : "")} onClick={() => setOpenIx(openIx === i ? -1 : i)}>
              <div className="n">0{i+1}</div>
              <div>
                <h5>{it.q}</h5>
                <div className="a">{it.a}</div>
              </div>
              <div className="toggle"><Icon name="plus" size={14} stroke={2}/></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="footer">
    <div className="container">
      <div className="footer-grid">
        <div className="col" style={{gap: 18, maxWidth: 380}}>
          <Brand />
          <p className="dim" style={{fontSize: 15, lineHeight: 1.5}}>
            The Cloud AI Computer. One quiet interface for everything you do.
          </p>
          <div className="row" style={{gap: 8}}>
            <a className="btn btn-ghost" href="https://github.com/utopusc/livinity-io" target="_blank" rel="noreferrer" style={{padding: "10px 14px", fontSize: 13}}>
              <Icon name="github" size={14}/> GitHub
            </a>
          </div>
        </div>
        <div>
          <h6>Product</h6>
          <a href="#">Livinity</a><a href="#">Liv</a><a href="#">Library</a><a href="#">Cloud</a><a href="#">What's new</a>
        </div>
        <div>
          <h6>Builders</h6>
          <a href="#">Documentation</a><a href="#">Open API</a><a href="#">Skills</a><a href="https://github.com/utopusc/livinity-io">Source</a><a href="#">Status</a>
        </div>
        <div>
          <h6>Company</h6>
          <a href="#">About</a><a href="#">Manifesto</a><a href="#">Security</a><a href="#">License</a><a href="#">Contact</a>
        </div>
      </div>
      <div className="brandwall">Livinity</div>
      <div className="footer-base">
        <span>© 2026 Livinity</span>
        <span>Made in San Francisco</span>
        <span>Open source · AGPL-3.0</span>
      </div>
    </div>
  </footer>
);

Object.assign(window, { Features, AppsMarquee, Install, Paths, FAQ, Footer });
