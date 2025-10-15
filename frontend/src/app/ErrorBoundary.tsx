import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      // Avoid unsafe String() coercion which can throw for exotic objects
      const err = this.state.error as unknown;
      let message = 'An unexpected error occurred.';
      if (err && typeof err === 'object' && 'message' in (err as Record<string, unknown>) && typeof (err as { message?: unknown }).message === 'string') {
        message = (err as { message: string }).message;
      } else if (this.state.error instanceof Error && this.state.error.message) {
        message = this.state.error.message;
      } else {
        try {
          // Best-effort formatting without risking String() coercion
          message = JSON.stringify(err, Object.getOwnPropertyNames(err as object));
        } catch {
          // Fallback: show the object's tag to give some hint
          message = Object.prototype.toString.call(err);
        }
      }

      return (
        <div style={{ padding: 24 }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}









