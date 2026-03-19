'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileText,
  Folder,
  CreditCard,
  ClipboardCheck,
  ChevronRight,
  FlaskConical,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { isDemoMode, enableDemoMode, disableDemoMode, DEMO_KEY } from '@/lib/api'

const nav = [
  { href: '/',            label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/clients',     label: 'Clients',      icon: Users },
  { href: '/projects',    label: 'Projets',      icon: FolderKanban },
  { href: '/finances',    label: 'Finances',     icon: CreditCard },
  { href: '/diagnostics', label: 'Diagnostics',  icon: ClipboardCheck },
  { href: '/files',       label: 'Fichiers',     icon: Folder },
  { href: '/crm',         label: 'CRM',          icon: FileText },
]

export default function Sidebar() {
  const path = usePathname()
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    setDemo(isDemoMode())
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_KEY) setDemo(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleDemo = () => {
    if (demo) {
      disableDemoMode()
    } else {
      enableDemoMode()
    }
    window.location.reload()
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-[var(--sidebar-width)] bg-sensia-950 text-white flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-sensia-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sensia-500 flex items-center justify-center font-bold text-sm">
            S
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">SENSIA</p>
            <p className="text-[10px] text-sensia-400 uppercase tracking-widest">Manager</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-sensia-700 text-white font-medium'
                  : 'text-sensia-300 hover:bg-sensia-800 hover:text-white'
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
              {active && <ChevronRight size={12} className="ml-auto opacity-60" />}
            </Link>
          )
        })}

        {/* Séparateur */}
        <div className="mx-4 my-3 border-t border-sensia-800" />

        {/* Bouton Demo */}
        <button
          onClick={toggleDemo}
          className={clsx(
            'w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors text-left',
            demo
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'text-sensia-300 hover:bg-sensia-800 hover:text-white'
          )}
          style={{ width: 'calc(100% - 1rem)' }}
        >
          {demo ? <X size={16} className="shrink-0" /> : <FlaskConical size={16} className="shrink-0" />}
          <span>{demo ? 'Quitter la démo' : 'Mode démo'}</span>
          {demo && (
            <span className="ml-auto text-[10px] font-semibold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded">
              DEMO
            </span>
          )}
        </button>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-sensia-800 text-[11px] text-sensia-500">
        <p>SENSIA DVZ © 2026</p>
        <p className="mt-0.5">Conseil IA · PME & Entrepreneurs</p>
      </div>
    </aside>
  )
}
