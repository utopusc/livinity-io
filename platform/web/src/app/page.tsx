'use client';

import Link from 'next/link';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { TextLoop } from '@/components/motion-primitives/text-loop';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { InView } from '@/components/motion-primitives/in-view';
import { BorderTrail } from '@/components/motion-primitives/border-trail';
import { TextShimmer } from '@/components/motion-primitives/text-shimmer';
import {
  Terminal,
  Check,
  ArrowRight,
  Sparkles,
  Search,
  Folder,
  Image,
  Music,
  Film,
  FileText,
  HardDrive,
  ChevronRight,
  LayoutGrid,
  List,
  Upload,
  Bot,
  Send,
  Globe,
  Wifi,
  Shield,
  Users,
  AppWindow,
  Settings,
  Key,
  Download,
  Play,
  Square,
  Monitor,
  Cpu,
  BarChart3,
} from 'lucide-react';

/* ─── Shared ─── */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-3 text-xs font-semibold tracking-[0.2em] uppercase text-neutral-400">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">{children}</h2>
  );
}

function SectionDesc({ children }: { children: string }) {
  return <p className="mx-auto mt-4 max-w-lg text-neutral-500">{children}</p>;
}

function MockWindow({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[20px] border border-neutral-200/60 bg-white/95 shadow-[0_8px_30px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] ${className}`}
    >
      {/* Title bar */}
      <div className="flex items-center justify-center border-b border-neutral-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5 absolute left-4">
          <div className="h-3 w-3 rounded-full bg-neutral-200" />
          <div className="h-3 w-3 rounded-full bg-neutral-200" />
          <div className="h-3 w-3 rounded-full bg-neutral-200" />
        </div>
        <span className="text-[13px] font-semibold text-neutral-600">{title}</span>
      </div>
      {children}
    </div>
  );
}

/* ─── Navbar ─── */
function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-neutral-100 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-black">
          livinity.io
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#desktop" className="text-sm text-neutral-400 transition-colors hover:text-black">Desktop</a>
          <a href="#appstore" className="text-sm text-neutral-400 transition-colors hover:text-black">App Store</a>
          <a href="#files" className="text-sm text-neutral-400 transition-colors hover:text-black">Files</a>
          <a href="#ai" className="text-sm text-neutral-400 transition-colors hover:text-black">AI</a>
          <a href="#pricing" className="text-sm text-neutral-400 transition-colors hover:text-black">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-neutral-500 transition-colors hover:text-black">Sign in</Link>
          <Link href="/register" className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800">Get Started</Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero ─── */
function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-100 via-white to-white" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-1.5 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-black" />
          <TextShimmer duration={2.5} className="text-xs font-medium [--base-color:theme(colors.neutral.800)] [--base-gradient-color:theme(colors.neutral.400)]">
            Self-hosted AI server platform
          </TextShimmer>
        </div>

        <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-black sm:text-6xl lg:text-7xl">
          <TextEffect per="word" preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3}>
            Your personal server,
          </TextEffect>
          <span className="mt-2 block">
            <TextEffect per="word" preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3} delay={0.4}>
              accessible
            </TextEffect>{' '}
            <TextLoop className="inline-block text-neutral-400" interval={3} transition={{ duration: 0.5, ease: 'easeInOut' }}>
              <span>anywhere.</span>
              <span>anytime.</span>
              <span>securely.</span>
            </TextLoop>
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-500">
          Install LivOS on any machine and access it from any browser. AI assistant, app store, multi-user — all self-hosted, all yours.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/register" className="group inline-flex items-center gap-2 rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">
            Create Free Account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="#desktop" className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-7 py-3.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50">
            Explore features
          </a>
        </div>

        <div className="mx-auto mt-10 max-w-lg">
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 p-5">
            <BorderTrail size={80} transition={{ duration: 4, repeat: Infinity }} style={{ boxShadow: '0px 0px 40px 10px rgba(255,255,255,0.15)' }} />
            <div className="flex items-center gap-3">
              <Terminal className="h-4 w-4 shrink-0 text-neutral-500" />
              <code className="text-sm text-neutral-300">
                <span className="text-white">curl</span> -sSL https://livinity.io/install.sh | <span className="text-white">sudo</span> bash
              </code>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-400">Free tier: 50GB/month. No credit card required.</p>
        </div>
      </div>
    </section>
  );
}

/* ─── Desktop Showcase ─── */
function DesktopSection() {
  const dockApps = [
    { emoji: '📁', name: 'Files' },
    { emoji: '⚙️', name: 'Settings' },
    { emoji: '📊', name: 'Usage' },
    { emoji: '🏪', name: 'Store' },
    { emoji: '🤖', name: 'AI Chat' },
    { emoji: '🖥️', name: 'Server' },
    { emoji: '⏱️', name: 'Tasks' },
    { emoji: '💻', name: 'Terminal' },
  ];

  return (
    <section id="desktop" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.6 }} viewOptions={{ once: true, margin: '0px 0px -100px 0px' }}>
          <div className="mb-16 text-center">
            <SectionLabel>Desktop</SectionLabel>
            <SectionTitle>A real desktop in your browser</SectionTitle>
            <SectionDesc>Windowed apps, animated wallpapers, dock with magnification, and multi-user — feels like a native OS.</SectionDesc>
          </div>
        </InView>

        <InView variants={{ hidden: { opacity: 0, y: 40, scale: 0.97 }, visible: { opacity: 1, y: 0, scale: 1 } }} transition={{ duration: 0.7, ease: 'easeOut' }} viewOptions={{ once: true, margin: '0px 0px -50px 0px' }}>
          <div className="relative mx-auto max-w-4xl">
            {/* Desktop mockup */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 shadow-2xl">
              {/* Desktop area */}
              <div className="relative h-[500px] p-6">
                {/* App grid */}
                <div className="grid grid-cols-6 gap-4 max-w-xs">
                  {[
                    { emoji: '📷', name: 'Immich' },
                    { emoji: '☁️', name: 'Nextcloud' },
                    { emoji: '🎬', name: 'Jellyfin' },
                    { emoji: '🐳', name: 'Portainer' },
                    { emoji: '📊', name: 'Grafana' },
                    { emoji: '🏠', name: 'Home' },
                  ].map((app) => (
                    <div key={app.name} className="flex flex-col items-center gap-1">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm text-2xl shadow-lg border border-white/10">
                        {app.emoji}
                      </div>
                      <span className="text-[10px] text-white/70 font-medium">{app.name}</span>
                    </div>
                  ))}
                </div>

                {/* Floating window */}
                <div className="absolute right-8 top-8 w-72 overflow-hidden rounded-[16px] bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-white/50">
                  <div className="flex items-center justify-center border-b border-neutral-100 py-2">
                    <span className="text-[11px] font-semibold text-neutral-600">AI Chat</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex justify-end">
                      <div className="rounded-2xl rounded-br-sm bg-neutral-900 px-3 py-1.5 text-[11px] text-white max-w-[180px]">
                        What apps can I install?
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-1.5 text-[11px] text-neutral-700 max-w-[200px]">
                        You can install Immich for photos, Jellyfin for media, Nextcloud for files, and 20+ more from the App Store.
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-neutral-100 p-2">
                    <div className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-1.5">
                      <span className="text-[11px] text-neutral-400 flex-1">Message...</span>
                      <Send className="h-3 w-3 text-neutral-300" />
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <div className="absolute bottom-20 left-6">
                  <p className="text-white/40 text-sm font-medium">Good morning,</p>
                  <p className="text-white text-2xl font-bold">Abubekir</p>
                </div>
              </div>

              {/* Dock */}
              <div className="flex items-center justify-center pb-3 px-6">
                <div className="flex items-center gap-1.5 rounded-2xl bg-white/15 backdrop-blur-2xl border border-white/20 px-3 py-1.5 shadow-lg">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-green-300 to-emerald-400 text-sm">🐻</div>
                  <div className="w-px h-6 bg-white/20 mx-1" />
                  {dockApps.map((app) => (
                    <div key={app.name} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-base hover:bg-white/20 transition-colors cursor-pointer" title={app.name}>
                      {app.emoji}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </InView>

        {/* Feature pills */}
        <AnimatedGroup preset="fade" className="mt-10 flex flex-wrap justify-center gap-3">
          {['Animated Wallpapers', 'Dock Magnification', 'Draggable Windows', 'Multi-User', 'Desktop Folders', 'Widgets'].map((f) => (
            <span key={f} className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-600">{f}</span>
          ))}
        </AnimatedGroup>
      </div>
    </section>
  );
}

/* ─── App Store ─── */
function AppStoreSection() {
  const apps = [
    { name: 'Immich', tag: 'Photos & Videos', emoji: '📷', status: 'running' },
    { name: 'Jellyfin', tag: 'Media Server', emoji: '🎬', status: 'running' },
    { name: 'Nextcloud', tag: 'Cloud Storage', emoji: '☁️', status: 'stopped' },
    { name: 'Portainer', tag: 'Docker Manager', emoji: '🐳', status: 'running' },
    { name: 'Vaultwarden', tag: 'Passwords', emoji: '🔐', status: 'not_installed' },
    { name: 'Grafana', tag: 'Monitoring', emoji: '📊', status: 'not_installed' },
  ];

  return (
    <section id="appstore" className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.6 }} viewOptions={{ once: true, margin: '0px 0px -100px 0px' }}>
          <div className="mb-16 text-center">
            <SectionLabel>App Store</SectionLabel>
            <SectionTitle>Install apps with one click</SectionTitle>
            <SectionDesc>Browse, install, and manage Docker apps. Each app gets its own subdomain — immich.you.livinity.io.</SectionDesc>
          </div>
        </InView>

        <InView variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.7 }} viewOptions={{ once: true }}>
          <MockWindow title="App Store" className="mx-auto max-w-3xl">
            <div className="flex">
              {/* Sidebar */}
              <div className="w-44 border-r border-neutral-100 p-3 hidden md:block">
                <div className="space-y-0.5">
                  {['Discover', 'All Apps', 'Categories', 'My Apps'].map((item, i) => (
                    <div key={item} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${i === 0 ? 'bg-neutral-100 text-black' : 'text-neutral-500'}`}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-neutral-100 pt-3">
                  <p className="px-3 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Categories</p>
                  {['Media', 'Dev Tools', 'Storage', 'Security'].map((c) => (
                    <div key={c} className="rounded-lg px-3 py-1 text-[12px] text-neutral-500">{c}</div>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 p-4">
                {/* Featured */}
                <div className="mb-4 rounded-xl bg-gradient-to-r from-neutral-900 to-neutral-700 p-5 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Featured</p>
                  <p className="mt-1 text-lg font-bold">Immich</p>
                  <p className="text-[12px] text-white/70">Self-hosted Google Photos alternative with AI-powered search.</p>
                </div>

                {/* App grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {apps.map((app) => (
                    <div key={app.name} className="rounded-xl border border-neutral-100 bg-white p-3 transition-shadow hover:shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-lg">{app.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-black truncate">{app.name}</p>
                          <p className="text-[10px] text-neutral-400">{app.tag}</p>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        {app.status === 'running' ? (
                          <div className="flex items-center gap-1 text-[10px] font-medium text-neutral-500">
                            <div className="h-1.5 w-1.5 rounded-full bg-black" />
                            Running
                          </div>
                        ) : app.status === 'stopped' ? (
                          <div className="flex items-center gap-1 text-[10px] font-medium text-neutral-400">
                            <Square className="h-2.5 w-2.5" />
                            Stopped
                          </div>
                        ) : (
                          <button className="rounded-lg bg-black px-3 py-1 text-[10px] font-semibold text-white">
                            Install
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </MockWindow>
        </InView>
      </div>
    </section>
  );
}

/* ─── Files ─── */
function FilesSection() {
  const files = [
    { name: 'Documents', icon: FileText, color: 'bg-sky-100 text-sky-600', size: '—', type: 'folder' },
    { name: 'Photos', icon: Image, color: 'bg-pink-100 text-pink-600', size: '—', type: 'folder' },
    { name: 'Videos', icon: Film, color: 'bg-rose-100 text-rose-600', size: '—', type: 'folder' },
    { name: 'Music', icon: Music, color: 'bg-purple-100 text-purple-600', size: '—', type: 'folder' },
    { name: 'Downloads', icon: Download, color: 'bg-green-100 text-green-600', size: '—', type: 'folder' },
    { name: 'report-2026.pdf', icon: FileText, color: 'bg-neutral-100 text-neutral-500', size: '2.4 MB', type: 'file' },
    { name: 'backup.tar.gz', icon: HardDrive, color: 'bg-neutral-100 text-neutral-500', size: '1.2 GB', type: 'file' },
    { name: 'notes.md', icon: FileText, color: 'bg-neutral-100 text-neutral-500', size: '12 KB', type: 'file' },
  ];

  return (
    <section id="files" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.6 }} viewOptions={{ once: true, margin: '0px 0px -100px 0px' }}>
          <div className="mb-16 text-center">
            <SectionLabel>File Manager</SectionLabel>
            <SectionTitle>Your files, anywhere</SectionTitle>
            <SectionDesc>Upload, browse, and manage your files. Image viewer, video player, and PDF support built in.</SectionDesc>
          </div>
        </InView>

        <InView variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.7 }} viewOptions={{ once: true }}>
          <MockWindow title="Files" className="mx-auto max-w-3xl">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2">
              <div className="flex items-center gap-1 rounded-lg bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-500">
                <Folder className="h-3 w-3" />
                <span>Home</span>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-black">Files</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1">
                <button className="rounded-lg p-1.5 hover:bg-neutral-100"><Upload className="h-3.5 w-3.5 text-neutral-400" /></button>
                <button className="rounded-lg p-1.5 hover:bg-neutral-100"><Search className="h-3.5 w-3.5 text-neutral-400" /></button>
                <button className="rounded-lg bg-neutral-100 p-1.5"><List className="h-3.5 w-3.5 text-neutral-600" /></button>
                <button className="rounded-lg p-1.5 hover:bg-neutral-100"><LayoutGrid className="h-3.5 w-3.5 text-neutral-400" /></button>
              </div>
            </div>

            {/* File list */}
            <div className="divide-y divide-neutral-50">
              {files.map((file) => (
                <div key={file.name} className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-50 transition-colors cursor-pointer">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${file.color}`}>
                    <file.icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-[13px] font-medium text-neutral-800">{file.name}</span>
                  <span className="text-[11px] text-neutral-400">{file.size}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-neutral-300" />
                </div>
              ))}
            </div>
          </MockWindow>
        </InView>
      </div>
    </section>
  );
}

/* ─── AI Chat ─── */
function AIChatSection() {
  const messages = [
    { role: 'user', text: 'Summarize my server status' },
    { role: 'ai', text: 'Your server is running smoothly. 4 apps are active: Immich (photos), Jellyfin (media), Nextcloud (storage), and Portainer (Docker). CPU at 12%, memory at 45%, disk at 230GB free.' },
    { role: 'user', text: 'Install Grafana for monitoring' },
    { role: 'ai', text: 'Installing Grafana... Docker image pulled, container started. Grafana is now accessible at grafana.you.livinity.io. Default login: admin / admin.' },
  ];

  return (
    <section id="ai" className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.6 }} viewOptions={{ once: true, margin: '0px 0px -100px 0px' }}>
          <div className="mb-16 text-center">
            <SectionLabel>AI Assistant</SectionLabel>
            <SectionTitle>Your server speaks your language</SectionTitle>
            <SectionDesc>Chat with your server. Install apps, manage files, check status — all through natural conversation.</SectionDesc>
          </div>
        </InView>

        <InView variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.7 }} viewOptions={{ once: true }}>
          <MockWindow title="AI Chat" className="mx-auto max-w-2xl">
            <div className="p-5 space-y-4 min-h-[320px]">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                      <Bot className="h-3.5 w-3.5 text-neutral-600" />
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-black text-white'
                      : 'rounded-bl-sm bg-neutral-100 text-neutral-700'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-100 p-3">
              <div className="flex items-center gap-2 rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-2.5">
                <span className="flex-1 text-[13px] text-neutral-400">Ask your server anything...</span>
                <Send className="h-4 w-4 text-neutral-300" />
              </div>
            </div>
          </MockWindow>
        </InView>
      </div>
    </section>
  );
}

/* ─── Settings ─── */
function SettingsSection() {
  return (
    <section id="settings" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.6 }} viewOptions={{ once: true, margin: '0px 0px -100px 0px' }}>
          <div className="mb-16 text-center">
            <SectionLabel>Settings & Monitoring</SectionLabel>
            <SectionTitle>Full control, zero complexity</SectionTitle>
            <SectionDesc>User management, resource monitoring, domain setup, integrations — all from one clean interface.</SectionDesc>
          </div>
        </InView>

        <InView variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.7 }} viewOptions={{ once: true }}>
          <MockWindow title="Settings" className="mx-auto max-w-3xl">
            <div className="flex">
              {/* Sidebar */}
              <div className="w-44 border-r border-neutral-100 p-3 hidden md:block">
                {[
                  { name: 'Account', icon: Users, active: false },
                  { name: 'Usage', icon: BarChart3, active: true },
                  { name: 'Users', icon: Users, active: false },
                  { name: 'Domain', icon: Globe, active: false },
                  { name: 'AI Config', icon: Bot, active: false },
                  { name: 'Wallpaper', icon: Monitor, active: false },
                  { name: 'Terminal', icon: Terminal, active: false },
                ].map((item) => (
                  <div key={item.name} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium ${item.active ? 'bg-neutral-100 text-black' : 'text-neutral-500'}`}>
                    <item.icon className="h-3.5 w-3.5" />
                    {item.name}
                  </div>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 p-5">
                <h3 className="text-sm font-semibold text-black mb-4">Resource Usage</h3>

                {/* CPU bar */}
                <div className="space-y-3">
                  {[
                    { label: 'CPU', value: 12, icon: Cpu },
                    { label: 'Memory', value: 45, icon: BarChart3 },
                    { label: 'Disk', value: 23, icon: HardDrive },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <r.icon className="h-3 w-3 text-neutral-400" />
                          <span className="text-[12px] font-medium text-neutral-600">{r.label}</span>
                        </div>
                        <span className="text-[12px] font-semibold text-black">{r.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100">
                        <div className="h-full rounded-full bg-black transition-all" style={{ width: `${r.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Running apps */}
                <h3 className="text-sm font-semibold text-black mt-6 mb-3">Running Apps</h3>
                <div className="space-y-2">
                  {[
                    { name: 'Immich', mem: '312 MB', cpu: '3%' },
                    { name: 'Jellyfin', mem: '256 MB', cpu: '1%' },
                    { name: 'Portainer', mem: '128 MB', cpu: '0.5%' },
                  ].map((app) => (
                    <div key={app.name} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-black" />
                        <span className="text-[12px] font-medium text-neutral-700">{app.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] text-neutral-400">{app.mem}</span>
                        <span className="text-[11px] text-neutral-400">{app.cpu}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </MockWindow>
        </InView>
      </div>
    </section>
  );
}

/* ─── Features grid ─── */
function FeaturesGrid() {
  const features = [
    { icon: Globe, title: 'Global Access', desc: 'Access your server from anywhere via your personal subdomain.' },
    { icon: Shield, title: 'Self-Hosted', desc: 'Your data stays on your machine. No cloud lock-in.' },
    { icon: Users, title: 'Multi-User', desc: 'Invite family or team. Each user gets their own space.' },
    { icon: AppWindow, title: '20+ Apps', desc: 'Immich, Jellyfin, Nextcloud, Grafana, and more.' },
    { icon: Wifi, title: 'Zero Config', desc: 'No port forwarding, no DNS setup. Just enter your API key.' },
    { icon: Key, title: 'Per-User Isolation', desc: 'Separate Docker containers, files, and settings per user.' },
  ];

  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.6 }} viewOptions={{ once: true }}>
          <div className="mb-16 text-center">
            <SectionLabel>Why Livinity</SectionLabel>
            <SectionTitle>Everything you need, nothing you don&apos;t</SectionTitle>
          </div>
        </InView>

        <AnimatedGroup preset="blur-slide" className="grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-neutral-100 bg-white p-6 transition-all hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 transition-colors group-hover:bg-black group-hover:text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-sm font-semibold text-black">{f.title}</h3>
              <p className="text-[13px] leading-relaxed text-neutral-500">{f.desc}</p>
            </div>
          ))}
        </AnimatedGroup>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function PricingSection() {
  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <InView variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }} viewOptions={{ once: true }}>
          <div className="mb-16 text-center">
            <SectionLabel>Pricing</SectionLabel>
            <SectionTitle>Start free, scale when ready</SectionTitle>
          </div>
        </InView>

        <div className="mx-auto max-w-md">
          <InView variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }} transition={{ duration: 0.5 }} viewOptions={{ once: true }}>
            <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
              <BorderTrail size={100} transition={{ duration: 6, repeat: Infinity }} style={{ boxShadow: '0px 0px 60px 20px rgba(0,0,0,0.06)' }} />
              <div className="text-center">
                <p className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">Free</p>
                <div className="mt-3 flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold text-black">$0</span>
                  <span className="text-neutral-400">/month</span>
                </div>
              </div>
              <ul className="mt-8 space-y-3">
                {['50 GB/month bandwidth', 'Personal subdomain', 'Unlimited apps', 'AI assistant', 'Multi-user', 'Automatic HTTPS'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-neutral-600">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                      <Check className="h-3 w-3 text-black" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-black py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </InView>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTASection() {
  return (
    <section className="border-t border-neutral-100 bg-neutral-50 py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <InView variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }} viewOptions={{ once: true }}>
          <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">Ready to own your cloud?</h2>
          <p className="mx-auto mt-4 max-w-md text-neutral-500">Turn any machine into your personal, AI-powered server — accessible from anywhere.</p>
          <div className="mt-8">
            <Link href="/register" className="group inline-flex items-center gap-2 rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">
              Create Free Account <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </InView>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-neutral-100 bg-white py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <span className="text-lg font-bold tracking-tight text-black">livinity.io</span>
          <div className="flex items-center gap-8 text-sm text-neutral-400">
            <Link href="/login" className="transition-colors hover:text-black">Sign in</Link>
            <Link href="/register" className="transition-colors hover:text-black">Sign up</Link>
            <a href="https://changelog.livinity.io" className="transition-colors hover:text-black">Changelog</a>
            <a href="https://github.com/livinity" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-black">GitHub</a>
          </div>
        </div>
        <div className="mt-8 border-t border-neutral-100 pt-6 text-center text-xs text-neutral-400">
          &copy; {new Date().getFullYear()} Livinity. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <Navbar />
      <HeroSection />
      <DesktopSection />
      <AppStoreSection />
      <FilesSection />
      <AIChatSection />
      <SettingsSection />
      <FeaturesGrid />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
