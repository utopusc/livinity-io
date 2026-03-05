'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Server, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { EnsureNoUser } from '@/providers/auth-guard';

function OnboardingStart() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-4">
      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Icon */}
        <motion.div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/8 border border-brand/12"
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <Server className="h-8 w-8 text-brand" strokeWidth={1.75} />
        </motion.div>

        {/* Heading */}
        <TextEffect
          as="h1"
          per="word"
          preset="fade-in-blur"
          className="text-[1.875rem] font-semibold text-neutral-900"
        >
          Welcome to LivOS
        </TextEffect>

        {/* Subtitle */}
        <TextEffect
          as="p"
          per="word"
          preset="fade"
          delay={0.3}
          className="mt-3 text-base text-neutral-500"
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
          className="mt-8 text-xs text-neutral-400"
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
