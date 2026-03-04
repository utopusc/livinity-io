'use client';

import { Database, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui';

export default function BackupsSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-text-tertiary" />
        <h4 className="text-xs font-medium text-text">Backups</h4>
        <Badge>Coming Soon</Badge>
      </div>
      <p className="text-xs text-text-tertiary">
        Backup and restore functionality will be available in a future update.
        This will include scheduled backups, cloud storage integration, and one-click restore.
      </p>
    </div>
  );
}
