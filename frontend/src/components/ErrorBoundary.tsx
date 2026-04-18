'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <AlertTriangle size={40} className="text-amber-400 mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Une erreur inattendue s'est produite</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md">
            {this.state.error?.message || 'Erreur inconnue'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-accessia-700 transition-colors"
          >
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
