import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
        this.handleReset = this.handleReset.bind(this);
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReset() {
        this.setState({ hasError: false, error: null, errorInfo: null });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary-ui">
                    <div className="error-boundary-card">
                        <AlertTriangle size={48} className="error-boundary-icon" />
                        <h2>Something went wrong</h2>
                        <p className="error-boundary-msg">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <div className="error-boundary-actions">
                            <button className="btn btn-read" onClick={this.handleReset}>
                                <RefreshCw size={16} /> Try Again
                            </button>
                            <button className="btn" onClick={() => window.location.href = '/'}>
                                Go Home
                            </button>
                        </div>
                        <details className="error-boundary-details">
                            <summary>Technical details</summary>
                            <pre>{this.state.error?.toString()}</pre>
                            <pre>{this.state.errorInfo?.componentStack}</pre>
                        </details>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
