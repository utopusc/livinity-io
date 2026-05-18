'use client';

import { useEffect } from 'react';

export function Toast({
  msg,
  error,
  onClose,
  timeout = 3500,
}: {
  msg: string;
  error?: boolean;
  onClose: () => void;
  timeout?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, timeout);
    return () => clearTimeout(t);
  }, [onClose, timeout]);

  return (
    <div className={`toast${error ? ' error' : ''}`} role="status">
      {msg}
    </div>
  );
}
