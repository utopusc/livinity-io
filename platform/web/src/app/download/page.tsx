'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { InView } from '@/components/motion-primitives/in-view';

/* ─── Platform Icons (inline SVG — lucide-react has no OS logos) ─── */

function WindowsIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function AppleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function LinuxIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 0 0-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.43.868.065 1.157-.41 1.743-.19.44.167.862.534 1.454.726.238.077.51.12.775.093.8-.07 1.398-.836 1.397-1.763 0-.752-.33-1.281-.546-1.726-.065-.135-.108-.298-.123-.46-.022-.27.015-.55.078-.795.246-.96.13-1.72-.023-2.403-.077-.339-.168-.67-.246-.972a8.8 8.8 0 0 0-.135-.498c.217-.165.385-.396.489-.674.155-.381.191-.838.091-1.276a2.8 2.8 0 0 0-.403-.87c-.5-.673-1.228-1.273-2.144-2.164-.756-.723-1.077-1.589-1.264-2.485a8 8 0 0 1-.145-1.283c-.027-.427.016-.858.027-1.282.013-.502.02-.862-.08-1.287C15.856.734 14.2.009 12.504 0m.07 1.217c1.384-.023 2.595.542 3.034 2.16.08.373.067.675.054 1.16-.013.406-.035.824-.003 1.282.024.342.093.68.183 1.017.22 1.048.63 2.107 1.556 2.992.86.845 1.543 1.392 1.953 1.94.207.28.344.567.423.84.08.273.09.577-.01.86a.9.9 0 0 1-.348.45c-.329-.48-.79-.794-1.265-.89-.476-.098-.958.006-1.375.25-.868.505-1.467 1.528-1.555 2.67-.026.064-.051.128-.075.195a5 5 0 0 1-.327.693c-.084.143-.19.3-.32.414a1 1 0 0 1-.404.223c-.372.102-.744-.033-.99-.243a7 7 0 0 1-.383-.407 19 19 0 0 0-.539-.583c-.214-.228-.5-.478-.862-.593-.26-.08-.556-.09-.835.007a.84.84 0 0 0-.398.28c-.168.208-.27.457-.37.662l-.018.037c-.147.3-.309.508-.497.627-.186.118-.39.143-.618.093-.455-.105-.833-.475-1.124-.873-.147-.2-.263-.413-.366-.635a2 2 0 0 1-.068-.164 28 28 0 0 1-.084-.241l-.063-.162a3.6 3.6 0 0 0-.249-.499c-.172-.278-.39-.532-.695-.736-.152-.102-.32-.186-.511-.246.265-.478.419-1.019.433-1.539.014-.529-.103-1.05-.342-1.476-.239-.426-.6-.754-1.057-.917-.259-.093-.536-.148-.737-.113l-.034-.051a7 7 0 0 1-.597-1.08c-.154-.373-.272-.759-.32-1.143-.049-.38-.022-.758.14-1.09.482-1.448 1.562-2.908 2.372-3.876.81-1.076 1.08-2.054 1.161-3.225.084-1.142.14-2.67 1.104-3.826.408-.496.971-.844 1.693-1.006A4 4 0 0 1 12.573 1.217z" />
    </svg>
  );
}

/* ─── Download Data ─── */

type Platform = 'windows' | 'macos' | 'linux';

const DOWNLOADS: Record<
  Platform,
  {
    url: string;
    label: string;
    fileSize: string;
    arch: string;
    Icon: (props: { size?: number }) => React.JSX.Element;
  }
> = {
  windows: {
    url: '/downloads/livinity-agent-setup-win-x64.exe',
    label: 'Windows',
    fileSize: '~60 MB',
    arch: 'x64',
    Icon: WindowsIcon,
  },
  macos: {
    url: '/downloads/Livinity-Agent.dmg',
    label: 'macOS',
    fileSize: '~60 MB',
    arch: 'Apple Silicon & Intel',
    Icon: AppleIcon,
  },
  linux: {
    url: '/downloads/livinity-agent_1.0_amd64.deb',
    label: 'Linux',
    fileSize: '~60 MB',
    arch: 'amd64 (.deb)',
    Icon: LinuxIcon,
  },
};

const PLATFORMS: Platform[] = ['windows', 'macos', 'linux'];

/* ─── Setup Steps ─── */

const STEPS = [
  {
    number: '1',
    title: 'Download & Install',
    description:
      'Run the installer for your platform. It takes less than a minute.',
  },
  {
    number: '2',
    title: 'Connect Your Account',
    description:
      'The agent opens your browser to sign in with your livinity.io account.',
  },
  {
    number: '3',
    title: 'Control with AI',
    description:
      'Ask your AI assistant to manage files, run commands, and more on your PC.',
  },
];

/* ─── Navbar ─── */

function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-neutral-100 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-black"
        >
          livinity.io
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="/"
            className="text-sm text-neutral-400 transition-colors hover:text-black"
          >
            Home
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-black"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── Download Button ─── */

function DownloadButton({
  platform,
  primary = false,
}: {
  platform: Platform;
  primary?: boolean;
}) {
  const { url, label, fileSize, arch, Icon } = DOWNLOADS[platform];

  if (primary) {
    return (
      <div className="flex flex-col items-center gap-2">
        <a
          href={url}
          className="group inline-flex items-center gap-3 rounded-full bg-black px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          <Icon size={24} />
          <span>Download for {label}</span>
          <Download className="h-5 w-5 opacity-60 transition-transform group-hover:translate-y-0.5" />
        </a>
        <span className="text-xs text-neutral-400">
          {fileSize} | {label} {arch}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href={url}
        className="group inline-flex items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:border-neutral-300 hover:bg-neutral-50"
      >
        <Icon size={20} />
        <span>Download for {label}</span>
      </a>
      <span className="text-xs text-neutral-400">{fileSize}</span>
    </div>
  );
}

/* ─── Hero Section ─── */

function HeroSection({
  detectedPlatform,
}: {
  detectedPlatform: Platform | null;
}) {
  return (
    <section className="pt-32 pb-16">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <TextEffect
          per="word"
          as="h1"
          preset="fade"
          className="text-4xl font-bold tracking-tight text-black sm:text-5xl"
        >
          Download Livinity Agent
        </TextEffect>
        <p className="mx-auto mt-5 max-w-md text-lg text-neutral-500">
          Control your PC from anywhere with AI
        </p>

        {/* Download buttons */}
        <div className="mt-12">
          {detectedPlatform ? (
            /* Detected platform: primary + secondary row */
            <AnimatedGroup preset="blur-slide" className="space-y-8">
              <div>
                <DownloadButton platform={detectedPlatform} primary />
              </div>
              <div className="flex flex-wrap items-start justify-center gap-6">
                {PLATFORMS.filter((p) => p !== detectedPlatform).map(
                  (platform) => (
                    <DownloadButton key={platform} platform={platform} />
                  )
                )}
              </div>
            </AnimatedGroup>
          ) : (
            /* Unknown platform: show all equally */
            <AnimatedGroup
              preset="blur-slide"
              className="flex flex-wrap items-start justify-center gap-6"
            >
              {PLATFORMS.map((platform) => (
                <div key={platform}>
                  <DownloadButton platform={platform} primary />
                </div>
              ))}
            </AnimatedGroup>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Setup Instructions ─── */

function SetupSection() {
  return (
    <section className="border-t border-neutral-100 mt-20 pt-16 pb-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <InView
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.5 }}
          viewOptions={{ once: true }}
        >
          <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
            Get started in under a minute
          </h2>
        </InView>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 max-w-3xl mx-auto">
          {STEPS.map((step) => (
            <InView
              key={step.number}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{
                duration: 0.5,
                delay: Number(step.number) * 0.15,
              }}
              viewOptions={{ once: true }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                  {step.number}
                </div>
                <h3 className="mt-4 text-base font-semibold text-black">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-500">
                  {step.description}
                </p>
              </div>
            </InView>
          ))}
        </div>
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
          <span className="text-lg font-bold tracking-tight text-black">
            livinity.io
          </span>
          <div className="flex items-center gap-8 text-sm text-neutral-400">
            <Link
              href="/download"
              className="transition-colors hover:text-black"
            >
              Download
            </Link>
            <Link
              href="/login"
              className="transition-colors hover:text-black"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="transition-colors hover:text-black"
            >
              Sign up
            </Link>
            <a
              href="https://changelog.livinity.io"
              className="transition-colors hover:text-black"
            >
              Changelog
            </a>
            <a
              href="https://github.com/livinity"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-black"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="mt-8 border-t border-neutral-100 pt-6 text-center text-xs text-neutral-400">
          &copy; {new Date().getFullYear()} Livinity. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ─── Platform Detection ─── */

function detectPlatform(): Platform | null {
  if (typeof window === 'undefined') return null;
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'windows';
  if (ua.includes('Mac')) return 'macos';
  if (ua.includes('Linux')) return 'linux';
  return null;
}

/* ─── Page ─── */

export default function DownloadPage() {
  const [detectedPlatform] = useState<Platform | null>(detectPlatform);

  return (
    <div className="min-h-screen bg-white text-black">
      <Navbar />
      <HeroSection detectedPlatform={detectedPlatform} />
      <SetupSection />
      <Footer />
    </div>
  );
}
