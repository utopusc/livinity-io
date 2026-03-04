'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <div>
            <p className="text-sm font-medium text-text">Something went wrong</p>
            <p className="mt-1 text-xs text-text-tertiary max-w-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
