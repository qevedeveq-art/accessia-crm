'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const isPublicPage = path.startsWith('/share')

  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[var(--sidebar-width)] flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
