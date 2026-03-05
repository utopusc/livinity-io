'use client';

import { useState } from 'react';
import { User, Lock, Check } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export default function AccountSection() {
  return (
    <div className="space-y-6">
      <ChangeNameForm />
      <div className="border-t border-border" />
      <ChangePasswordForm />
    </div>
  );
}

function ChangeNameForm() {
  const { data: user } = trpcReact.user.get.useQuery();
  const utils = trpcReact.useUtils();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const mutation = trpcReact.user.set.useMutation({
    onSuccess: () => {
      utils.user.get.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-text-tertiary" />
        <h4 className="text-xs font-medium text-text">Display Name</h4>
      </div>
      <p className="text-xs text-text-tertiary">
        Current name: <span className="text-text-secondary">{user?.name ?? '...'}</span>
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="New name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          onClick={() => {
            if (name.trim()) mutation.mutate({ name: name.trim() });
          }}
          loading={mutation.isPending}
          disabled={!name.trim()}
        >
          {saved ? <Check className="h-4 w-4" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const mutation = trpcReact.user.changePassword.useMutation({
    onSuccess: () => {
      setCurrent('');
      setNewPw('');
      setConfirm('');
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = () => {
    setError('');
    if (newPw !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (newPw.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    mutation.mutate({ currentPassword: current, newPassword: newPw });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-text-tertiary" />
        <h4 className="text-xs font-medium text-text">Change Password</h4>
      </div>
      <div className="max-w-xs space-y-2">
        <Input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          type="password"
          placeholder="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <Button
        size="sm"
        onClick={handleSubmit}
        loading={mutation.isPending}
        disabled={!current || !newPw || !confirm}
      >
        {saved ? <Check className="h-4 w-4" /> : 'Change Password'}
      </Button>
    </div>
  );
}
