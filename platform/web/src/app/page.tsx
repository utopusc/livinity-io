import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Livinity — Your Personal AI Server, Accessible Anywhere',
  description: 'Install LivOS on any machine and access it from anywhere via livinity.io. AI assistant, app store, multi-user — all self-hosted.',
  openGraph: {
    title: 'Livinity — Your Personal AI Server, Accessible Anywhere',
    description: 'Install LivOS on any machine and access it from anywhere. AI assistant, app store, multi-user — all self-hosted.',
    url: 'https://livinity.io',
    siteName: 'Livinity',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Nav */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-xl font-bold tracking-tight">Livinity</span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">Sign in</Link>
          <Link href="/register" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-20 text-center">
        <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Your personal server,<br />
          <span className="text-zinc-400">accessible anywhere.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-500">
          Install LivOS on any machine and access it from any browser via your personal subdomain. AI assistant, app store, and multi-user — all self-hosted, all yours.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/register" className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Create Free Account
          </Link>
          <a href="#how-it-works" className="rounded-lg border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">
            How it works
          </a>
        </div>
        <p className="mt-4 text-xs text-zinc-400">Free tier: 50GB/month bandwidth. No credit card required.</p>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-zinc-100 bg-zinc-50 py-20 dark:border-zinc-900 dark:bg-zinc-900/50">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">Three steps to anywhere access</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: '1', title: 'Install LivOS', desc: 'One command installs everything on your machine — Ubuntu, mini PC, or any Linux server.' },
              { step: '2', title: 'Enter your API key', desc: 'Generate a key in your dashboard and paste it during setup. Your server connects automatically.' },
              { step: '3', title: 'Access anywhere', desc: 'Visit your-name.livinity.io from any browser. Your apps, files, and AI — always available.' },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-50 dark:text-zinc-900">
                  {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">Everything you need</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { title: 'AI Assistant', desc: 'Built-in AI powered by advanced language models. Chat, code, create — right from your server.' },
              { title: 'App Store', desc: 'Install apps like Immich, Nextcloud, and more with one click. Each gets its own subdomain.' },
              { title: 'Multi-User', desc: 'Invite family or team members. Each user gets their own space, apps, and permissions.' },
              { title: 'Self-Hosted', desc: 'Your data stays on your machine. No cloud lock-in. Full control, always.' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-zinc-100 bg-zinc-50 py-20 dark:border-zinc-900 dark:bg-zinc-900/50">
        <div className="mx-auto max-w-md px-6 text-center">
          <h2 className="mb-8 text-3xl font-bold tracking-tight">Simple pricing</h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium uppercase tracking-wider text-zinc-400">Free</p>
            <p className="mt-2 text-4xl font-bold">$0</p>
            <p className="mt-1 text-sm text-zinc-500">per month</p>
            <ul className="mt-6 space-y-3 text-left text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex items-center gap-2"><span className="text-emerald-500">&#10003;</span> 50 GB/month bandwidth</li>
              <li className="flex items-center gap-2"><span className="text-emerald-500">&#10003;</span> Personal subdomain</li>
              <li className="flex items-center gap-2"><span className="text-emerald-500">&#10003;</span> Unlimited apps</li>
              <li className="flex items-center gap-2"><span className="text-emerald-500">&#10003;</span> AI assistant included</li>
              <li className="flex items-center gap-2"><span className="text-emerald-500">&#10003;</span> Multi-user support</li>
            </ul>
            <Link href="/register" className="mt-6 block rounded-lg bg-zinc-900 py-3 text-center text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
              Get Started Free
            </Link>
            <p className="mt-4 text-xs text-zinc-400">Premium plans with custom domains and unlimited bandwidth coming soon.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 py-12 dark:border-zinc-900">
        <div className="mx-auto max-w-4xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <span className="text-sm font-semibold">Livinity</span>
            <div className="flex gap-6 text-sm text-zinc-400">
              <Link href="/login">Sign in</Link>
              <Link href="/register">Sign up</Link>
              <a href="https://github.com/livinity" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-zinc-400">&copy; {new Date().getFullYear()} Livinity. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
