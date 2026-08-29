import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('👾 [CRITICAL SYSTEM ERRROR DETECTED BY BOUNDARY]:', error, errorInfo);
    this.setState({ errorInfo });
    if ((window as any).Sentry) {
      (window as any).Sentry.captureException(error);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6 text-[var(--ink)] selection:bg-[var(--ink)] selection:text-[var(--bg)]">
          <div className="max-w-md w-full card p-6 relative overflow-hidden text-left border-[var(--danger)]/20">
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-[var(--danger)]/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-3.5 mb-5 border-b border-[var(--line)] pb-4">
              <div className="h-10 w-10 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/20 flex items-center justify-center text-[var(--danger)] animate-pulse">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-sm uppercase mono font-bold text-[var(--danger)] tracking-widest leading-none">Security System Fault</h2>
                <p className="eyebrow mt-1">Error Code: ERR_UI_STATE_CRASH</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-2)] leading-relaxed">
              The interface state engine encountered an unexpected runtime crash when rendering. Please reload the application to restore the interface.
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger)]/20 rounded-lg text-[10px] text-[var(--danger)] mono overflow-auto max-h-24 whitespace-pre-wrap">
                Exception: {this.state.error.toString()}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3.5 pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-primary w-full flex items-center justify-center gap-2 bg-[var(--danger)] border-[var(--danger)] hover:brightness-95 text-white"
              >
                <RefreshCw size={12} className="stroke-[2.5px]" />
                Reboot Application Interface
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
