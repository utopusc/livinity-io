import { Loader2 } from 'lucide-react';

export default function DesktopLoading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <p className="text-xs text-text-tertiary">Loading desktop...</p>
      </div>
    </div>
  );
}
