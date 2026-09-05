import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** The last line of defence: a render error anywhere below would otherwise
 *  unmount the whole tree and leave a reader staring at a blank cream page
 *  inside the newspaper's iframe. Show a sentence and a way back instead. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The Cheese Census hit a render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty load-error" role="alert">
        <p>Something went wrong showing The Cheese Census.</p>
        <button className="board-action" onClick={() => location.reload()}>
          Reload
        </button>
        <p className="load-error-detail">{this.state.error.message}</p>
      </div>
    );
  }
}
