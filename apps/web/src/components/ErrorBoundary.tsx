"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { logError } from "@/utilities/errorUtils";

interface State {
  error: Error | null;
  showDetails: boolean;
}

/** Catches render errors anywhere below it and offers a way back. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, "ErrorBoundary");
    console.error("Error caught by boundary:", error, info);
  }

  reset = () => this.setState({ error: null, showDetails: false });

  render() {
    const { error, showDetails } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <AlertTriangle size={44} className="mb-4 text-primary" />
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm text-secondaryText">
          The page hit an unexpected error. Your wallet and account are safe.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-xl bg-primary px-5 py-3 font-semibold text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              this.reset();
              window.location.assign("/home");
            }}
            className="rounded-xl border border-borderColor px-5 py-3 font-semibold"
          >
            Go home
          </button>
        </div>
        <button
          type="button"
          onClick={() => this.setState({ showDetails: !showDetails })}
          className="mt-6 text-xs text-secondaryText underline"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
        {showDetails && (
          <pre className="mt-3 max-w-full overflow-x-auto rounded-lg bg-cardBackground p-3 text-left text-xs">
            {error.message}
          </pre>
        )}
      </div>
    );
  }
}
