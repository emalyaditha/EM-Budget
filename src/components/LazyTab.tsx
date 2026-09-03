import { Suspense, Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import TabSkeleton from './TabSkeleton';

function TabErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--danger)]/25 bg-[var(--surface)] p-6 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/20 flex items-center justify-center text-[var(--danger)]">
        <AlertTriangle size={20} />
      </div>
      <p className="text-sm font-bold text-[var(--ink)]">This section failed to load.</p>
      <p className="eyebrow mt-1 mb-4">A required module could not be fetched.</p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-primary inline-flex items-center justify-center gap-2 text-xs"
      >
        Try Again
      </button>
    </div>
  );
}

interface LazyTabProps {
  children?: ReactNode;
}

interface LazyTabState {
  hasError: boolean;
}

export default class LazyTab extends Component<LazyTabProps, LazyTabState> {
  public state: LazyTabState = { hasError: false };

  public static getDerivedStateFromError(): LazyTabState {
    return { hasError: true };
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      return <TabErrorFallback onRetry={this.handleRetry} />;
    }
    return (
      <Suspense fallback={<TabSkeleton />}>
        {this.props.children}
      </Suspense>
    );
  }
}
