'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Server, ArrowRight } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { EnsureNoUser } from '@/providers/auth-guard';

function OnboardingStart() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/10">
            <Server className="h-10 w-10 text-brand" />
          </div>
          <h1 className="text-display-sm font-bold text-text">
            Welcome to LivOS
          </h1>
          <p className="mt-2 text-body-lg text-text-secondary">
            Your AI-powered home server is ready to set up.
          </p>
        </div>

        <div className="space-y-3">
          <Link href="/onboarding/create-account">
            <Button size="lg" className="w-full">
              Get Started
              <ArrowRight size={18} />
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-caption text-text-tertiary">
          LivOS v3.0
        </p>
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
