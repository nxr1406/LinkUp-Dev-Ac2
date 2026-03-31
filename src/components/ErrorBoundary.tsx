import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // this.setState is already called by getDerivedStateFromError
  }

  public render() {
    if (this.state.hasError) {
      let parsedError = null;
      try {
        if (this.state.error?.message) {
          parsedError = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            
            {parsedError ? (
              <div className="text-left bg-gray-50 p-4 rounded-lg mt-4 mb-6 overflow-auto text-sm border border-gray-200">
                <p className="font-semibold text-red-600 mb-2">Firestore Permission Error</p>
                <p className="text-gray-700 mb-1"><strong>Operation:</strong> {parsedError.operationType}</p>
                <p className="text-gray-700 mb-1"><strong>Path:</strong> {parsedError.path}</p>
                <p className="text-gray-700 mb-3"><strong>Details:</strong> {parsedError.error}</p>
                <p className="text-xs text-gray-500">Please update your Firestore Security Rules in the Firebase Console to allow this operation.</p>
              </div>
            ) : (
              <p className="text-gray-600 mb-6 text-sm">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
            )}

            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center w-full py-3 px-4 bg-[#0095F6] text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
            >
              <RefreshCw size={18} className="mr-2" />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
