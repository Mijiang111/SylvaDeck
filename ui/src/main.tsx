import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { App } from "./App";
import "./index.css";

class GlobalCrashBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  componentDidMount() {
    window.addEventListener("error", this.handleWindowError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ppt-workbench] app_render_failed", {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  handleWindowError = (event: ErrorEvent) => {
    if (!event.error && event.target !== window) {
      return;
    }
    const nextError =
      event.error instanceof Error
        ? event.error
        : new Error(event.message || "Unhandled runtime error.");
    this.setState({ error: nextError });
  };

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const nextError =
      event.reason instanceof Error
        ? event.reason
        : new Error(
            typeof event.reason === "string"
              ? event.reason
              : "Unhandled promise rejection.",
          );
    console.error("[ppt-workbench] app_unhandled_rejection", nextError);
    this.setState({ error: nextError });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#f4ede3] px-6 py-10 text-[#183246]">
          <div className="mx-auto max-w-4xl rounded-[32px] border border-[#ddcfbb] bg-white/82 px-8 py-8 shadow-[0_24px_60px_rgba(20,27,39,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8f6c2f]">
              Runtime Recovery
            </div>
            <h1
              className="mt-4 text-[2.3rem] leading-[1.02] text-[#162d3d]"
              style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}
            >
              The workbench hit a client-side crash.
            </h1>
            <p className="mt-4 max-w-[60ch] text-[1rem] leading-7 text-[#526773]">
              The browser stayed alive, but one runtime error took down the page tree. Refresh
              once. If the same screen returns, send the error detail below and I can patch the
              exact failing path.
            </p>
            <div className="mt-7 rounded-[24px] border border-[#e2d7c7] bg-[#fbf6ee] px-6 py-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a97a0]">
                Error detail
              </div>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-[0.95rem] leading-6 text-[#203848]">
                {this.state.error.stack || this.state.error.message}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlobalCrashBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GlobalCrashBoundary>
  </StrictMode>,
);
