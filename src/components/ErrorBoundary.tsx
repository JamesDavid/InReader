import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors anywhere below it and shows a recoverable
 * fallback instead of unmounting the whole app to a blank screen.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught error in component tree:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100 p-6">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-4">
              The app hit an unexpected error. Your data is safe — it's stored
              locally. Try reloading.
            </p>
            <pre className="text-xs text-left text-red-300 bg-gray-800 rounded p-3 mb-4 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
