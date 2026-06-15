// Atoms — icons + small UI bits, exported to window
const { useState, useEffect, useRef } = React;

// ---- Shared profile session cache (across page navs in same tab) ----
let _profileCache = null;
let _profilePromise = null;
function fetchProfileOnce() {
  if (_profileCache !== null) return Promise.resolve(_profileCache);
  if (_profilePromise) return _profilePromise;
  _profilePromise = fetch("/api/auth/me", { credentials: "same-origin" })
    .then(r => r.ok ? r.json() : { user: null })
    .then(d => { _profileCache = d.user || null; return _profileCache; })
    .catch(() => { _profileCache = null; return null; });
  return _profilePromise;
}

// ---- ProfileMenu — popover with Dashboard / Settings / Log out ----
const ProfileMenu = ({ user }) => {
  const [open, setOpen] = useState(false);
  const initial = user && user.username ? user.username[0].toUpperCase() : "?";
  const name = user && user.username ? user.username : "you";

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {}
    window.location.href = "/";
  };

  const I = {
    dash: <svg className="pp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
    set:  <svg className="pp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    out:  <svg className="pp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  };

  return (
    <div className="profile-wrap">
      <button
        className={"profile-trigger" + (open ? " open" : "")}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>{name}</span>
        <svg className="pt-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span className="pt-avatar">{initial}</span>
      </button>
      {open && (
        <>
          <div className="profile-backdrop" onClick={() => setOpen(false)}/>
          <div className="profile-popover" role="menu">
            <div className="pp-head">
              <div className="pp-name">{user.username}</div>
              {user.email && <div className="pp-email">{user.email}</div>}
            </div>
            <a className="pp-item" href="/dashboard">{I.dash}Dashboard</a>
            <a className="pp-item" href="/profile">{I.set}Settings</a>
            <div className="pp-sep"/>
            <button className="pp-item danger" onClick={logout}>{I.out}Log out</button>
          </div>
        </>
      )}
    </div>
  );
};

// ---- Inline icons (24x24 default, stroke 1.5) ----
const Icon = ({ name, size = 18, stroke = 1.5, ...rest }) => {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest,
  };
  switch (name) {
    case "home":
      return (<svg {...props}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg>);
    case "apps":
      return (<svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
    case "folder":
      return (<svg {...props}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>);
    case "spark":
      return (<svg {...props}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>);
    case "shield":
      return (<svg {...props}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>);
    case "terminal":
      return (<svg {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>);
    case "send":
      return (<svg {...props} fill="currentColor" stroke="none"><path d="M3 11l18-8-8 18-2-8z"/></svg>);
    case "plus":
      return (<svg {...props}><path d="M12 5v14M5 12h14"/></svg>);
    case "arrow-right":
      return (<svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
    case "arrow-up-right":
      return (<svg {...props}><path d="M7 17L17 7M9 7h8v8"/></svg>);
    case "github":
      return (<svg {...props} fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.71c-2.78.62-3.37-1.36-3.37-1.36-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.35 4.8-4.58 5.06.36.31.68.93.68 1.87v2.77c0 .27.18.6.69.49C19.14 20.62 22 16.78 22 12.25 22 6.58 17.52 2 12 2z"/></svg>);
    case "x":
      return (<svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>);
    case "lock":
      return (<svg {...props}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>);
    case "cpu":
      return (<svg {...props}><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>);
    case "globe":
      return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>);
    case "bolt":
      return (<svg {...props} fill="currentColor" stroke="none"><path d="M13 2L4 14h6l-2 8 10-12h-6z"/></svg>);
    case "puzzle":
      return (<svg {...props}><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><circle cx="17" cy="17" r="4"/></svg>);
    case "wave":
      return (<svg {...props}><path d="M2 12c2 0 2-4 4-4s2 8 4 8 2-12 4-12 2 16 4 16 2-4 4-4"/></svg>);
    case "whatsapp":
      return (<svg {...props} fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M20.5 3.5A11 11 0 0 0 3.6 17.4L2 22l4.7-1.5A11 11 0 0 0 20.5 3.5zm-8.5 17a9 9 0 0 1-4.6-1.3l-.3-.2-2.8.9.9-2.7-.2-.3a9 9 0 1 1 7 3.6zm5-6.7c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1c-.9-.4-1.7-.8-2.4-1.7-.6-.6-.9-1.3-.9-1.5s.2-.4.3-.5.2-.2.3-.4.1-.3 0-.4-.6-1.5-.9-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4s-.9.9-.9 2.2.9 2.5 1 2.6 1.8 2.8 4.4 3.9c.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.1-.6-.3z"/></svg>);
    case "telegram":
      return (<svg {...props} fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M22 3L1.5 11l5.7 1.7L19 5l-9.5 9 .6 6 3.4-3.5 4.8 3.7z"/></svg>);
    case "discord":
      return (<svg {...props} fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M20 4.5A18 18 0 0 0 15.5 3l-.3.5a13 13 0 0 0-6.4 0L8.5 3A18 18 0 0 0 4 4.5c-3 4-4 8-3.5 12 1.6 1.2 3.2 1.9 4.7 2.4l1-1.6c-.7-.3-1.4-.6-2-1l.5-.3a13 13 0 0 0 13 0l.5.3c-.6.4-1.3.7-2 1l1 1.6c1.5-.5 3-1.2 4.7-2.4.7-4.5-.7-8.4-3.5-12.3zM9 13.7c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2zm6 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z"/></svg>);
    case "claude":
      return (<svg {...props} fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M5 4l4 16h2l1-4h4l1 4h2L15 4h-2l-1 4H8L7 4H5z"/></svg>);
    case "check":
      return (<svg {...props}><path d="M4 12l5 5 11-11"/></svg>);
    case "circle-dot":
      return (<svg {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>);
    default:
      return null;
  }
};

const Brand = ({ withText = true }) => (
  <a href="#" className="brand">
    <span className="brand-mark" aria-hidden="true"></span>
    {withText && <span>Livinity</span>}
  </a>
);

const Nav = () => {
  React.useEffect(() => {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle("stuck", (window.scrollY || 0) > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  useEffect(() => {
    let aborted = false;
    fetchProfileOnce().then(u => {
      if (aborted) return;
      setUser(u);
      setAuthLoaded(true);
    });
    return () => { aborted = true; };
  }, []);

  return (
  <nav className="nav">
    <div className="container nav-inner">
      <Brand />
      <div className="nav-links">
        <a href="#liv">Liv Agent</a>
        <a href="#apps">App Library</a>
        <a href="#install">Self-Host</a>
        <a href="#developers">Developers</a>
        <a href="#pricing">Pricing</a>
      </div>
      <div className="nav-cta">
        <a className="btn btn-ghost btn-icon" href="https://github.com/utopusc/livinity-io" target="_blank" rel="noreferrer" aria-label="GitHub">
          <Icon name="github" size={16}/>
        </a>
        {authLoaded && user ? (
          <ProfileMenu user={user}/>
        ) : authLoaded ? (
          <>
            <a className="nav-signin" href="/login">Sign in</a>
            <a className="btn btn-primary" href="/register">Sign up</a>
          </>
        ) : (
          <span style={{ display: "inline-block", width: 92, height: 32 }} aria-hidden="true"/>
        )}
      </div>
    </div>
  </nav>
  );
};

Object.assign(window, { Icon, Brand, Nav, ProfileMenu, fetchProfileOnce });
