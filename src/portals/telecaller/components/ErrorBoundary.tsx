import { Component, type ReactNode } from "react";
import { Button } from "@telecaller/components/ui/Button";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "Something went wrong" };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
          <p className="text-lg font-semibold">This screen stopped working</p>
          <p className="mt-2 max-w-md text-sm text-slate-500">{this.state.error}</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
