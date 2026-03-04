'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
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
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
            <Lock className="h-8 w-8 text-brand" />
          </div>
          <h1 className="text-heading-lg font-bold text-text">Welcome back</h1>
          <p className="mt-1 text-body text-text-secondary">
            Enter your password to continue
          </p>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-body font-medium text-text">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 2FA */}
              {needs2fa && (
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <label htmlFor="totp" className="text-body font-medium text-text">
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
                  className="text-caption text-error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {error}
                </motion.p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={!password || loading}
                loading={loading}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-caption text-text-tertiary">
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
