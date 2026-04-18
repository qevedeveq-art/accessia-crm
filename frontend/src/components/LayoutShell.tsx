'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Sidebar from './Sidebar'
import GlobalSearch from './GlobalSearch'
import ErrorBoundary from './ErrorBoundary'
import { isDemoMode, DEMO_KEY, getAuthStatus, getAuthToken } from '@/lib/api'
import { FlaskConical, WifiOff, Loader2 } from 'lucide-react'

function LayoutShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const isPublicPage = path.startsWith('/share') || path.startsWith('/sign') || path.startsWith('/nps')
  const [demo, setDemo] = useState(false)
  const [offline, setOffline] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Vérification auth au montage
    getAuthStatus()
      .then(s => {
        if (s.auth_enabled && !getAuthToken()) {
          window.location.href = '/login'
        } else {
          setAuthChecked(true)
        }
      })
      .catch(() => setAuthChecked(true)) // En cas d'erreur, on laisse passer
  }, [])

  useEffect(() => {
    setDemo(isDemoMode())
    setOffline(!navigator.onLine)
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_KEY) setDemo(e.newValue === '1')
    }
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    const onApiOffline = (e: Event) => {
      const detail = (e as CustomEvent<{ offline: boolean }>).detail
      setOffline(Boolean(detail?.offline))
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('accessia-offline-status', onApiOffline as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('accessia-offline-status', onApiOffline as EventListener)
    }
  }, [])

  if (!authChecked && !isPublicPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-accessia-600" />
      </div>
    )
  }

  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <GlobalSearch />
      <Sidebar />
      <main className="ml-[var(--sidebar-width)] flex-1 overflow-auto">
        {demo && (
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2 bg-amber-400 text-amber-900 text-xs font-semibold">
            <FlaskConical size={14} />
            <span>Mode démo actif — les données affichées sont fictives et les modifications ne sont pas enregistrées.</span>
          </div>
        )}
        {offline && (
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-xs font-semibold">
            <WifiOff size={14} />
            <span>Mode hors-ligne — données depuis le cache local</span>
          </div>
        )}
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LayoutShellInner>{children}</LayoutShellInner>
    </Suspense>
  )
}
