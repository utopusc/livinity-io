// Sections — Apple-clean monochrome, Cloud AI Computer language
const { useState: useStateS } = React;

// ---- A reusable alternating (zig-zag) feature row: big video one side, copy the other ----
const FeatureRow = ({ item, i }) => (
  <div className={"walk-row" + (i % 2 ? " flip" : "")} id={item.id}>
    <div className="walk-media">
      <LivVideo src={"/videos/web/" + item.f + ".mp4"} poster={"/videos/web/posters/" + item.f + ".jpg"} ratio="16 / 9"/>
    </div>
    <div className="walk-text">
      <span className="walk-eyebrow">{item.eyebrow}</span>
      <h3>{item.title}</h3>
      <p>{item.text}</p>
      {item.chips && (
        <div className="walk-channels">
          {item.chips.map((c, k) => <span key={k} className="walk-chip">{c}</span>)}
        </div>
      )}
    </div>
  </div>
);

// ---- Walkthrough — the product, A to Z, every step shown on a big looping video ----
const WALK_ITEMS = [
  {f: "login",             eyebrow: "Sign in",     title: "Liv is wherever you are.", text: "Open your-name.livinity.io in any browser, on your laptop, phone, or tablet. Sign in, and Liv, your apps, and your files are right there. Nothing to install, nothing to carry."},
  {f: "dock-navbar",       eyebrow: "The desktop", title: "A desktop that stays out of your way.", text: "A clean dock, a quiet navbar. Everything one click away, nothing shouting for your attention."},
  {f: "liv-ai",            eyebrow: "Meet Liv",    title: "An assistant that does the thing.", text: "Ask in plain words. Liv plans your week, finds that file, drafts the reply, and runs your apps. It even works while you sleep.", chips: ["writes for you", "remembers everything", "runs your apps", "stays private"]},
  {f: "files",             eyebrow: "Files",       title: "Files, photos, and storage in one place.", text: "Drag, drop, preview, share. Your whole drive lives in the browser, encrypted and exportable any time you like."},
  {f: "appstore",          eyebrow: "App Store",   title: "Everything you already use, in a tap.", text: "More than 200 carefully selected open-source apps for files, photos, notes, mail, and automation. Installed, polished, and kept current for you."},
  {f: "terminal",          eyebrow: "For builders", id: "developers", title: "A real terminal, built in.", text: "Open a full shell right in the browser. Run commands, manage your apps and services, and drive your whole computer from the command line. No SSH, no local setup."},
  {f: "terminal-shortcut", eyebrow: "Shortcuts",   title: "Turn anything into a shortcut.", text: "Set up a shortcut once, like a terminal command, and Liv remembers it. Run the whole flow again with a single click, any time."},
  {f: "app-sharing",       eyebrow: "App sharing",  title: "Share your apps with friends.", text: "Installed an app you love? Open it up to friends in a click. They get to use it right on your computer, with no setup of their own."},
];

const Walkthrough = () => (
  <section className="section walk-section" id="liv">
    <div className="container">
      <span className="eyebrow">A new kind of computer.</span>
      <h2 className="h2" style={{marginTop: 16, maxWidth: "22ch"}}>
        Designed to feel simple. Built to do anything.
      </h2>
      <p className="lede" style={{marginTop: 18, maxWidth: "58ch"}}>
        Livinity is the operating system. Liv is the assistant. Here's the whole thing, from your first sign-in to a computer that runs itself.
      </p>
      <div className="walk">
        {WALK_ITEMS.map((item, i) => <FeatureRow key={i} item={item} i={i}/>)}
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
          publishes them on <em>your own domain</em>, and Liv manages everything by AI:
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
            <span className="eyebrow">Self-host.</span>
            <h2 className="h2" style={{maxWidth: "20ch"}}>
              Your own computer, one line away.
            </h2>
            <p className="lede">
              Run the installer on any Linux box and sign in at your own address. No cloud bill, no lock-in.
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
              <span><Icon name="check" size={14} stroke={2}/> 200+ apps included</span>
            </div>
          </div>
          <div className="terminal">
            <div className="terminal-bar"><span></span><span></span><span></span></div>
            <div className="terminal-body">
              <div><span className="com"># Self-host on any Linux box.</span></div>
              <div><span className="prompt">$</span> curl -fsSL https://livinity.io/install | bash</div>
              <div className="com">  ↳ provisioning Docker · Caddy · Postgres…</div>
              <div className="com">  ↳ installing LivOS & 200+ apps… <span className="ok">done</span></div>
              <div className="com">  ↳ securing tunnel… <span className="ok">done</span></div>
              <div className="com">  ↳ waking Liv… <span className="ok">ready</span></div>
              <div style={{marginTop: 10}}><span className="prompt">→</span> open <span style={{color: "#fff"}}>your-name.livinity.io</span> <span className="cur"></span></div>
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
        Two plans. Both self-hosted.
      </h2>
      <p className="lede" style={{marginTop: 16, maxWidth: "56ch"}}>
        Either way, LivOS runs on your own hardware — 200+ apps, a secure tunnel, and Liv built in. The difference is the address: bring your own domain on Free, or get a managed <em>name</em>.livinity.io with Pro.
      </p>
      <div className="paths two">
        <div className="path-card">
          <span className="ribbon">Free</span>
          <h4>Free — bring your own domain</h4>
          <div className="price">$0<em> /forever</em></div>
          <p className="dim" style={{fontSize: 15}}>The complete LivOS on your own hardware — you connect it with your domain and Cloudflare.</p>
          <ul>
            <li>Apps at <em>app-you</em>.yourdomain.com</li>
            <li>Your own domain + your own Cloudflare</li>
            <li>App Store: 200+ apps, one-click install</li>
            <li>Liv AI assistant built in, bring your own keys</li>
            <li>Same self-hosted LivOS as Pro</li>
            <li>No card, no subscription — ever</li>
          </ul>
          <a className="btn btn-ghost cta" href="/register?plan=free&mode=signup">Choose Free <Icon name="arrow-right" size={14}/></a>
          <p className="dim" style={{fontSize: 13, marginTop: 16, textAlign: "center"}}>
            Needs your own domain and a free Cloudflare account.
          </p>
        </div>
        <div className="path-card feat">
          <span className="ribbon">Livinity Pro</span>
          <h4>Livinity Pro</h4>
          <div className="price">$7.99<em> /mo</em></div>
          <p className="dim" style={{fontSize: 15}}>Or $69.99/year. 3-day free trial. Cancel anytime during the trial and you're never charged.</p>
          <ul>
            <li>Your own <em>name</em>.livinity.io subdomain</li>
            <li>Managed secure tunnel — no open ports, home IP hidden</li>
            <li>DDoS & botnet protection at Cloudflare's edge</li>
            <li>App Store: 200+ apps, one-click install</li>
            <li>Liv AI assistant built in, bring your own keys</li>
            <li>Remote access from anywhere</li>
            <li>No domain or Cloudflare setup needed</li>
          </ul>
          <a className="btn btn-primary cta" href="/pricing">Start 3-day free trial <Icon name="arrow-right" size={14}/></a>
          <p className="dim" style={{fontSize: 13, marginTop: 16, textAlign: "center"}}>
            Pro is <a href="#install">self-hosted</a> too — same OS on your hardware, we run the address and tunnel for you.
          </p>
        </div>
      </div>
    </div>
  </section>
);

const FAQ_ITEMS = [
  {q: "What is a Cloud AI Computer?", a: "A full computer (operating system, apps, and assistant) that runs on your own hardware and opens in your browser, anywhere. Behind a secure tunnel, it becomes your own cloud. Sign in and your computer is right there."},
  {q: "Is my data really mine?", a: "Yes. Everything Liv learns about you, every file, every chat, is encrypted and stored in your computer's space. Open source means anyone can verify there's no telemetry. And it all lives on your own hardware from day one."},
  {q: "Which AI does Liv use?", a: "Bring your own. Liv works with Claude, Gemini, and local models. You choose. We never charge you for tokens, and the keys are yours."},
  {q: "Can I use Livinity on my phone?", a: "Open it in any browser. Liv remembers your conversation between every screen: phone, laptop, tablet, IDE."},
  {q: "Do I have to be technical?", a: "No. One command on any Linux box and the installer does the rest. If you can use a website, you can use Livinity. Builders get an open API on top."},
  {q: "What if I want to leave?", a: "Export everything and take it anywhere. It was on your own machine all along. Livinity is open source, so the door is always unlocked."},
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
          <a href="/docs">Documentation</a><a href="#">Open API</a><a href="#">Skills</a><a href="https://github.com/utopusc/livinity-io">Source</a><a href="#">Status</a>
        </div>
        <div>
          <h6>Company</h6>
          <a href="#">About</a><a href="#">Manifesto</a><a href="#">Security</a><a href="#">License</a><a href="#">Contact</a>
        </div>
        <div>
          <h6>Legal</h6>
          <a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a><a href="/legal/acceptable-use">Acceptable Use</a><a href="/legal/cookies">Cookies</a><a href="/legal/refund">Refunds</a>
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

// ---- DockerShowcase — "Docker, built in", every step on a big alternating video ----
const DOCKER_ITEMS = [
  {f: "docker-first",      eyebrow: "Step 01", title: "One click in the Liv bar.",        text: "Open Docker straight from the Liv bar. No terminal, no config files to hand-edit."},
  {f: "docker-activates",  eyebrow: "Step 02", title: "Activate with a tap.",            text: "Turn a service on and watch it come up live, with status you can actually read."},
  {f: "docker-containers", eyebrow: "Step 03", title: "Every container, live.",          text: "See every running container, its logs, and its health at a glance, all in the browser."},
  {f: "docker-imagepull",  eyebrow: "Step 04", title: "Pull images in the background.",  text: "Grab any image from the registry while you keep working. Liv handles the rest."},
  {f: "docker-stacks",     eyebrow: "Step 05", title: "Compose whole stacks.",           text: "Bring up multi-service stacks from one definition. Orchestrate everything from a single place."},
];
const DockerShowcase = () => (
  <section className="section walk-section" id="docker">
    <div className="container">
      <span className="eyebrow">For builders.</span>
      <h2 className="h2" style={{marginTop: 16, maxWidth: "20ch"}}>
        Docker, built in.
      </h2>
      <p className="lede" style={{marginTop: 16, maxWidth: "56ch"}}>
        Run containers, pull images, and orchestrate stacks straight from your computer, no terminal required. Scroll through how it works.
      </p>
      <div className="walk">
        {DOCKER_ITEMS.map((item, i) => <FeatureRow key={i} item={item} i={i}/>)}
      </div>
    </div>
  </section>
);

Object.assign(window, { Walkthrough, AppsMarquee, Install, Paths, FAQ, Footer, DockerShowcase });
