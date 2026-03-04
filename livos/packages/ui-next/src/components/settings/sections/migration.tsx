'use client';

import { ArrowRightFromLine } from 'lucide-react';
import { Badge } from '@/components/ui';

export default function MigrationSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowRightFromLine className="h-4 w-4 text-text-tertiary" />
        <h4 className="text-xs font-medium text-text">Migration Assistant</h4>
        <Badge>Coming Soon</Badge>
      </div>
      <p className="text-xs text-text-tertiary">
        Transfer data and settings from a Raspberry Pi or other installation.
        This feature will guide you through the migration process step by step.
      </p>
    </div>
  );
}
