import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/errors/report";

type Props = {
  children: ReactNode;
  /** What to show instead of the crashed subtree. */
  fallback: ReactNode | ((error: Error) => ReactNode);
  /** Where the error came from, for the console line. */
  label?: string;
};

type State = { error: Error | null };

/**
 * F04. React unmounts the whole root when a render throws and nothing
 * catches it; one malformed message from a connector used to blank the app
 * for every member of the organization. Class component because React has
 * no hook for componentDidCatch.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[${this.props.label ?? "ErrorBoundary"}]`,
      error,
      info.componentStack,
    );

    // E1. The component stack is the part worth keeping: a render error's own
    // stack points into React's reconciler, and this is what names the
    // component that actually threw.
    reportError(error, {
      boundary: this.props.label ?? "ErrorBoundary",
      component_stack: info.componentStack,
    });
  }

  render() {
    const { error } = this.state;

    if (error) {
      const { fallback } = this.props;
      return typeof fallback === "function" ? fallback(error) : fallback;
    }

    return this.props.children;
  }
}
