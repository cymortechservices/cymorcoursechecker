import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Shows a readable message instead of a blank page if a section throws while rendering. */
export default class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error:', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-semibold">This section could not be shown.</p>
        <p className="mt-1 text-sm">{this.state.error.message}</p>
        <button type="button" className="btn btn-ghost mt-3" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Try again</button>
      </div>
    );
  }
}
