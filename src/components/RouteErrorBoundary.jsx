import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * RouteErrorBoundary
 *
 * Wraps a single route so that an error in (e.g.) MangaDetails
 * doesn't crash the whole app — just that page.
 *
 * Usage:
 *   <RouteErrorBoundary>
 *     <MangaDetails />
 *   </RouteErrorBoundary>
 */
export default class RouteErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[RouteErrorBoundary]', error, info?.componentStack);
    }

    // Reset when the route changes (props.resetKey changes)
    static getDerivedStateFromProps(props, state) {
        if (props.resetKey !== state.prevResetKey) {
            return { hasError: false, error: null, prevResetKey: props.resetKey };
        }
        return null;
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary-ui">
                    <div className="error-boundary-card">
                        <AlertTriangle size={40} className="error-boundary-icon" />
                        <h2>Something went wrong</h2>
                        <p className="error-boundary-msg">
                            {this.state.error?.message || 'An unexpected error occurred on this page.'}
                        </p>
                        <div className="error-boundary-actions">
                            <button
                                className="btn btn-read"
                                onClick={() => this.setState({ hasError: false, error: null })}
                            >
                                <RefreshCw size={16} /> Try Again
                            </button>
                            <button className="btn" onClick={() => window.history.back()}>
                                Go Back
                            </button>
                        </div>
                        {import.meta.env.DEV && (
                            <details className="error-boundary-details">
                                <summary>Stack trace</summary>
                                <pre>{this.state.error?.stack}</pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
