'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui';

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
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10"
        >
          <CheckCircle2 className="h-10 w-10 text-success" />
        </motion.div>

        <h1 className="text-display-sm font-bold text-text">You're all set!</h1>
        <p className="mt-2 text-body-lg text-text-secondary">
          Your LivOS account has been created successfully.
        </p>

        <div className="mt-8">
          <Button size="lg" onClick={() => router.push('/')}>
            Go to Desktop
          </Button>
          <p className="mt-3 text-caption text-text-tertiary">
            Redirecting in {countdown}s...
          </p>
        </div>
      </motion.div>
    </div>
  );
}
