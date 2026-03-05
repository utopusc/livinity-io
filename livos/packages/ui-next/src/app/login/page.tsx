'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { useAuth } from '@/providers/auth';
import { EnsureLoggedOut } from '@/providers/auth-guard';

function LoginForm() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(password, needs2fa ? totpToken : undefined);
    } catch (err: any) {
      const message = err?.message || '';
      if (message.includes('2FA') || message.includes('totp')) {
        setNeeds2fa(true);
        setError('');
      } else if (message.includes('Incorrect password') || message.includes('incorrect')) {
        setError('Incorrect password');
      } else {
        setError(message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-4">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <motion.div
            className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/8 border border-brand/12"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <Lock className="h-5 w-5 text-brand" strokeWidth={2} />
          </motion.div>

          <TextEffect
            as="h1"
            per="word"
            preset="fade-in-blur"
            className="text-xl font-semibold text-neutral-900"
          >
            Welcome back
          </TextEffect>

          <TextEffect
            as="p"
            per="word"
            preset="fade"
            delay={0.3}
            className="mt-1.5 text-sm text-neutral-500"
          >
            Enter your password to continue
          </TextEffect>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-black/[0.06] bg-white shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-neutral-900"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  error={!!error}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* 2FA */}
            {needs2fa && (
              <motion.div
                className="space-y-1.5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <label
                  htmlFor="totp"
                  className="text-sm font-medium text-neutral-900"
                >
                  2FA Code
                </label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="text-center tracking-[0.3em] font-mono"
                />
              </motion.div>
            )}

            {/* Error */}
            {error && (
              <motion.p
                className="text-xs text-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {error}
              </motion.p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full mt-1"
              disabled={!password || loading}
              loading={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          LivOS
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <EnsureLoggedOut>
      <LoginForm />
    </EnsureLoggedOut>
  );
}
