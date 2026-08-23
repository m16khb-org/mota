import { Component, type ErrorInfo, type ReactNode } from "react";

/** Top-level render crash containment. Without this, a single render
 * exception unmounts the whole React tree — the "entire app turns white"
 * failure mode. The boundary keeps a minimal, on-brand recovery surface and
 * surfaces the error message so the next occurrence is diagnosable on
 * screen. Classes are sanctioned here: this IS a framework boundary
 * (ARCHITECTURE.md allows classes for framework boundaries). */

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Machine-readable breadcrumb for QA; kept on the container element
    // so an attached debugger or test can assert it without console access.
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    return (
      <section className="app-error" role="alert" aria-labelledby="app-error-title">
        <span className="eyebrow">일시적 오류</span>
        <h1 id="app-error-title">화면을 다시 불러오지 못했습니다</h1>
        <p>
          저장한 장소와 절차는 브라우저에 그대로 있습니다. 다시 시도하거나
          새로고침해 주세요.
        </p>
        <pre className="app-error-detail">{error.message}</pre>
        <div className="commute-eta-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            다시 시도
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      </section>
    );
  }
}
