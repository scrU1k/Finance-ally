import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas text-ink flex flex-col items-center justify-center p-6 text-center font-geist">
          <div className="bg-surface p-6 rounded-2xl shadow-xl max-w-sm w-full border border-surface-border">
            <h2 className="text-xl font-bold mb-4 text-red-500">App Cannot Load</h2>
            <p className="text-muted-custom">
              Your device's browser engine is outdated. Please update Android System WebView from the Play Store.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
