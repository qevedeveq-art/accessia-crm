'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  BarChart2,
  SearchCheck,
  Package,
  Receipt,
  BookOpen,
  Sun,
  LayoutTemplate,
  Webhook,
  Bell,
  Wrench,
} from 'lucide-react'
import { clsx } from 'clsx'
import { isDemoMode, enableDemoMode, disableDemoMode, DEMO_KEY, getNotificationSummary } from '@/lib/api'

const nav = [
  { href: '/',            label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/clients',     label: 'Clients',         icon: Users },
  { href: '/projects',    label: 'Projets',         icon: FolderKanban },
  { href: '/devis',       label: 'Devis',           icon: Receipt },
  { href: '/finances',    label: 'Finances',        icon: CreditCard },
  { href: '/diagnostics', label: 'Diagnostics',     icon: ClipboardCheck },
  { href: '/recherche',   label: 'Prospection IA',  icon: SearchCheck },
  { href: '/prestations', label: 'Prestations',     icon: Package },
  { href: '/files',       label: 'Fichiers',        icon: Folder },
  { href: '/crm',         label: 'CRM',             icon: FileText },
  { href: '/reporting',   label: 'Reporting',       icon: BarChart2 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/guide',       label: 'Guide RGPD',      icon: BookOpen },
  { href: '/today',     label: 'Mon Jour',   icon: Sun },
  { href: '/templates', label: 'Templates',  icon: LayoutTemplate },
  { href: '/webhooks',  label: 'Webhooks',   icon: Webhook },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench },
]

export default function Sidebar() {
  const path = usePathname()
  const [demo, setDemo] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  useEffect(() => {
    setDemo(isDemoMode())
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_KEY) setDemo(e.newValue === '1')
    }
    const loadSummary = () => {
      if (document.visibilityState === 'hidden') return
      getNotificationSummary().then(summary => setUnreadNotifications(summary.unread)).catch(() => {})
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', loadSummary)
    loadSummary()
    const timer = window.setInterval(loadSummary, 30000)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', loadSummary)
      window.clearInterval(timer)
    }
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
    <aside className="fixed inset-y-0 left-0 w-[var(--sidebar-width)] bg-accessia-950 text-white flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-accessia-800">
        <div className="bg-white rounded-xl px-3 py-2 flex items-center justify-center">
          <Image
            src="/logo.jpg"
            alt="ACCESSIA Pro"
            width={160}
            height={68}
            className="object-contain"
            priority
          />
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
                  ? 'bg-accessia-700 text-white font-medium'
                  : 'text-accessia-300 hover:bg-accessia-800 hover:text-white'
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
              <span className="ml-auto flex items-center gap-2">
                {href === '/notifications' && unreadNotifications > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
                {active && <ChevronRight size={12} className="opacity-60" />}
              </span>
            </Link>
          )
        })}

        {/* Séparateur */}
        <div className="mx-4 my-3 border-t border-accessia-800" />

        {/* Bouton Demo */}
        <button
          onClick={toggleDemo}
          className={clsx(
            'w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors text-left',
            demo
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'text-accessia-300 hover:bg-accessia-800 hover:text-white'
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
      <div className="px-4 py-4 border-t border-accessia-800 text-[11px] text-accessia-500">
        <div className="px-3 py-2 text-xs text-gray-400 text-center">⌘K Recherche globale</div>
        <p>ACCESSIA Pro © 2026</p>
        <p className="mt-0.5">Conseil IA · PME & Entrepreneurs</p>
      </div>
    </aside>
  )
}
