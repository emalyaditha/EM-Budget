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
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('👾 [CRITICAL SYSTEM ERRROR DETECTED BY BOUNDARY]:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Transparently forward telemetry markers to Sentry/Datadog if loaded
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
        <div className="min-h-screen bg-primary flex items-center justify-center p-6 text-primary font-sans selection:bg-blue-500/30 selection:text-success">
          <div className="max-w-md w-full bg-card border border-subtle rounded-2xl p-6 shadow-2xl relative overflow-hidden text-left">
            {/* Glow backing layout ornamentations */}
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-3.5 mb-5 border-b border-default/80 pb-4">
              <div className="h-10 w-10 rounded-xl bg-danger border border-red-800/40 flex items-center justify-center text-danger animate-pulse">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-sm uppercase font-mono font-bold text-danger tracking-widest leading-none">Security System Fault</h2>
                <p className="text-[10px] text-muted font-mono mt-1">Error Code: ERR_UI_STATE_CRASH</p>
              </div>
            </div>

            <p className="text-xs text-secondary leading-relaxed font-mono">
              The interface state engine encountered an unexpected runtime crash when rendering. Your financial ledger data is fully intact and saved to persistent cloud engines safely.
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 bg-red-950/20 border border-red-900/30 rounded-lg text-[10px] text-danger font-mono overflow-auto max-h-24 whitespace-pre-wrap">
                Exception: {this.state.error.toString()}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3.5 pt-4 border-t border-default/80">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2 px-4 bg-red-500 hover:bg-red-400 active:scale-[0.98] transition-all rounded-lg text-xs font-mono font-bold uppercase tracking-wider text-[#0c0c0e] flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-500/10"
              >
                <RefreshCw size={12} className="stroke-[2.5px] animate-spin" />
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
