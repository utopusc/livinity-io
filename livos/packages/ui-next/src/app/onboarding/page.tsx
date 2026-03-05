'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Server, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { EnsureNoUser } from '@/providers/auth-guard';

function OnboardingStart() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.85 0.08 259) / 0.18), oklch(0.985 0.002 247.84)',
      }}
    >
      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Icon */}
        <motion.div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/10 shadow-sm"
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <Server className="h-10 w-10 text-brand" strokeWidth={1.75} />
        </motion.div>

        {/* Heading */}
        <TextEffect
          as="h1"
          per="word"
          preset="fade-in-blur"
          className="text-display-sm font-bold text-text"
        >
          Welcome to LivOS
        </TextEffect>

        {/* Subtitle */}
        <TextEffect
          as="p"
          per="word"
          preset="fade"
          delay={0.3}
          className="mt-3 text-body-lg text-text-secondary"
        >
          Your AI-powered home server is ready to set up.
        </TextEffect>

        {/* CTA */}
        <motion.div
          className="mt-10 space-y-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link href="/onboarding/create-account">
            <Button size="lg" className="w-full">
              Get Started
              <ArrowRight size={18} />
            </Button>
          </Link>
        </motion.div>

        <motion.p
          className="mt-8 text-caption text-text-tertiary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
        >
          LivOS v3.0
        </motion.p>
      </motion.div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <EnsureNoUser>
      <OnboardingStart />
    </EnsureNoUser>
  );
}
