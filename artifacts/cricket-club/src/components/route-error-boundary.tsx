import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time throw inside a route so one broken page shows an
 * inline error instead of blanking the whole app (header and footer included).
 * Mounted around every route `Suspense` in App.tsx. Recovery is a plain
 * re-render attempt; a reload link is offered for anything that persists.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the console for diagnosis; there is no error-reporting
    // service wired up yet.
    console.error("Route render failed", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto my-12 max-w-lg rounded-lg border bg-card p-6 text-center shadow-sm"
      >
        <h2 className="text-lg font-semibold">Something went wrong on this page</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The rest of the site is unaffected. Try again, or reload the page.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={this.reset}>
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
