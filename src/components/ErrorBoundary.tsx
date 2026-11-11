import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** What this part of the app is, for the message: "The output". */
  name: string
  /** Changing this clears the error and tries again (the sheet's text, say). */
  resetKey: unknown
  children: ReactNode
}

interface State {
  error: Error | null
  /** The resetKey the error happened with. */
  failedKey: unknown
}

/**
 * Keeps a failure in one part of the app from blanking all of it: if drawing
 * its children throws, it shows what went wrong in their place, and tries
 * again when `resetKey` changes. (The editor and the sheet's text are outside
 * it, so work is never lost to a drawing error.)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, failedKey: undefined }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (!state.error) return null
    // First render after the error: remember what it failed with. A later change tries again.
    if (state.failedKey === undefined) return { failedKey: props.resetKey }
    return props.resetKey === state.failedKey ? null : { error: null, failedKey: undefined }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.name} couldn't be shown:`, error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="app__error" role="alert">
        {this.props.name} couldn’t be shown: {this.state.error.message}. Your sheet is safe; changing it tries again.
      </div>
    )
  }
}
