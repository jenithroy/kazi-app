import React from "react";
import { Btn } from "./ui";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", maxWidth: 480, margin: "40px auto" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected error occurred while loading this view."}
          </p>
          <Btn kind="primary" size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Btn>
        </div>
      );
    }
    return this.props.children;
  }
}
