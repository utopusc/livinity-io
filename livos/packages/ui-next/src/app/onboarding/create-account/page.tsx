'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { User, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { useAuth } from '@/providers/auth';
import { EnsureNoUser } from '@/providers/auth-guard';

function CreateAccountForm() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const isValid = name.trim().length > 0 && password.length >= 6 && passwordsMatch;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setError('');
    setLoading(true);

    try {
      await register(name.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Failed to create account');
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
            <User className="h-5 w-5 text-brand" strokeWidth={2} />
          </motion.div>

          <TextEffect
            as="h1"
            per="word"
            preset="fade-in-blur"
            className="text-xl font-semibold text-neutral-900"
          >
            Create Account
          </TextEffect>

          <TextEffect
            as="p"
            per="word"
            preset="fade"
            delay={0.3}
            className="mt-1.5 text-sm text-neutral-500"
          >
            Set up your LivOS admin account
          </TextEffect>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-black/[0.06] bg-white shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="text-sm font-medium text-neutral-900"
              >
                Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </div>

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
                  placeholder="At least 6 characters"
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

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirm"
                className="text-sm font-medium text-neutral-900"
              >
                Confirm Password
              </label>
              <Input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                error={confirmPassword.length > 0 && !passwordsMatch}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <motion.p
                  className="text-xs text-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  Passwords do not match
                </motion.p>
              )}
            </div>

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
              disabled={!isValid || loading}
              loading={loading}
            >
              {loading ? 'Creating...' : 'Create Account'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function CreateAccountPage() {
  return (
    <EnsureNoUser>
      <CreateAccountForm />
    </EnsureNoUser>
  );
}
