'use client';

import { useState } from 'react';
import { Check, ExternalLink, LogOut, Loader2 } from 'lucide-react';
import { Button, Input, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export default function AiConfigSection() {
  const { data: status, isLoading } = trpcReact.ai.getClaudeCliStatus.useQuery();
  const utils = trpcReact.useUtils();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Checking Claude status...</span>
      </div>
    );
  }

  const isAuthenticated = status?.authenticated;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-text">Claude Subscription</h4>
          <Badge variant={isAuthenticated ? 'success' : 'default'}>
            {isAuthenticated ? 'Connected' : 'Not connected'}
          </Badge>
        </div>
        <p className="text-xs text-text-tertiary">
          Sign in with your Claude account to use AI features.
        </p>
      </div>

      {isAuthenticated ? (
        <AuthenticatedState />
      ) : (
        <LoginFlow />
      )}
    </div>
  );
}

function AuthenticatedState() {
  const utils = trpcReact.useUtils();
  const logoutMutation = trpcReact.ai.claudeLogout.useMutation({
    onSuccess: () => utils.ai.getClaudeCliStatus.invalidate(),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-success">
        <Check className="h-4 w-4" />
        <span className="text-xs">Claude is authenticated and ready</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => logoutMutation.mutate()}
        loading={logoutMutation.isPending}
      >
        <LogOut className="mr-1.5 h-3.5 w-3.5" />
        Sign Out
      </Button>
    </div>
  );
}

function LoginFlow() {
  const utils = trpcReact.useUtils();
  const [loginUrl, setLoginUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const startLogin = trpcReact.ai.startClaudeLogin.useMutation({
    onSuccess: (data: any) => {
      if (data.alreadyAuthenticated) {
        utils.ai.getClaudeCliStatus.invalidate();
      } else if (data.url) {
        setLoginUrl(data.url);
      }
    },
    onError: (err) => setError(err.message),
  });

  const submitCode = trpcReact.ai.submitClaudeLoginCode.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        utils.ai.getClaudeCliStatus.invalidate();
        setLoginUrl('');
        setCode('');
      } else {
        setError(data.error || 'Login failed');
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!loginUrl) {
    return (
      <div className="space-y-3">
        <Button
          size="sm"
          onClick={() => startLogin.mutate()}
          loading={startLogin.isPending}
        >
          Sign in with Claude
        </Button>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-neutral-50 border border-border p-3">
        <p className="mb-2 text-xs text-text-secondary">
          1. Open this link to sign in:
        </p>
        <a
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
        >
          Open Claude Login
          <ExternalLink className="h-3 w-3" />
        </a>
        <p className="mb-2 mt-3 text-xs text-text-secondary">
          2. Enter the code shown after login:
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="max-w-[200px]"
          />
          <Button
            size="sm"
            onClick={() => submitCode.mutate({ code })}
            loading={submitCode.isPending}
            disabled={!code.trim()}
          >
            Submit
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
