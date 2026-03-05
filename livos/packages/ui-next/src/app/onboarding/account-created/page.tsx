'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { TextEffect } from '@/components/motion-primitives/text-effect';

export default function AccountCreatedPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.push('/');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-4">
      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 16 }}
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/8 border border-success/15"
        >
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={1.75} />
        </motion.div>

        {/* Heading */}
        <TextEffect
          as="h1"
          per="word"
          preset="fade-in-blur"
          delay={0.2}
          className="text-[1.875rem] font-semibold text-neutral-900"
        >
          You're all set!
        </TextEffect>

        {/* Subtitle */}
        <TextEffect
          as="p"
          per="word"
          preset="fade"
          delay={0.45}
          className="mt-2 text-base text-neutral-500"
        >
          Your LivOS account has been created successfully.
        </TextEffect>

        {/* Action */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <Button size="lg" onClick={() => router.push('/')}>
            Go to Desktop
          </Button>
          <p className="mt-3 text-xs text-neutral-400">
            Redirecting in {countdown}s...
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
