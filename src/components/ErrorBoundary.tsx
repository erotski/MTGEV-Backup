import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Prevents a single view-level render error from blanking the entire page.
 * Renders a diagnostic message with the raw error instead of a white screen.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // `react` resolves without ambient types in this project's tsconfig, so
  // React.Component's inherited members are invisible to tsc; declare them
  // explicitly (they exist at runtime via the real React.Component).
  declare props: ErrorBoundaryProps;
  declare state: ErrorBoundaryState;
  declare setState: (state: Partial<ErrorBoundaryState>) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-3xl mx-auto my-8 bg-rose-50 border-2 border-dashed border-rose-300 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-rose-950">
            {this.props.label ? `${this.props.label} failed to render` : 'This view failed to render'}
          </h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">
            An unexpected data or rendering error occurred. This is a data-contract or rendering bug, not a synthetic fallback being applied.
          </p>
          <p className="text-[10px] text-rose-600 font-mono break-words max-w-lg mx-auto">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
