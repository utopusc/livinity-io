import { FileQuestion, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
        <FileQuestion className="h-8 w-8 text-text-tertiary" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold text-text">Page not found</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
      <Link href="/">
        <Button>
          <Home className="mr-2 h-4 w-4" />
          Go Home
        </Button>
      </Link>
    </div>
  );
}
