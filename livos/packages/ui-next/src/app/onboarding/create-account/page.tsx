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
    <div
      className="flex min-h-dvh items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.85 0.08 259) / 0.18), oklch(0.985 0.002 247.84)',
      }}
    >
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <motion.div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 shadow-sm"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <User className="h-7 w-7 text-brand" strokeWidth={2} />
          </motion.div>

          <TextEffect
            as="h1"
            per="word"
            preset="fade-in-blur"
            className="text-heading-lg font-bold text-text"
          >
            Create Account
          </TextEffect>

          <TextEffect
            as="p"
            per="word"
            preset="fade"
            delay={0.3}
            className="mt-1.5 text-body text-text-secondary"
          >
            Set up your LivOS admin account
          </TextEffect>
        </div>

        {/* Card */}
        <Card className="shadow-card border-black/[0.06]">
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="name"
                  className="text-body-sm font-medium text-text"
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
                  className="text-body-sm font-medium text-text"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="confirm"
                  className="text-body-sm font-medium text-text"
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
                    className="text-caption text-error"
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
                  className="text-caption text-error"
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
          </CardContent>
        </Card>
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
