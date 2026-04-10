'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  BellOff,
  CheckCheck,
  RefreshCw,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  FileText,
  Users,
  FolderKanban,
  CreditCard,
  Filter,
} from 'lucide-react'
import {
  checkNotifications,
  deleteNotification,
  getNotifications,
  getNotificationSummary,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationSummary,
} from '@/lib/api'

const severityConfig: Record<'critical' | 'warning' | 'info', { icon: any; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
}

const entityIcons: Record<string, any> = {
  invoice: CreditCard,
  client: Users,
  project: FolderKanban,
  task: FileText,
}

const typeLabels: Record<string, string> = {
  facture_retard: 'Facture en retard',
  tache_retard: 'Tâche en retard',
  prospect_inactif: 'Prospect inactif',
  phase_echeance: 'Échéance à venir',
}

function notificationHref(n: NotificationItem) {
  if (n.entity_type === 'invoice') return '/finances'
  if (n.entity_type === 'task') return '/crm'
  if (n.entity_type === 'client' && n.entity_id) return `/clients/${n.entity_id}`
  if (n.entity_type === 'project' && n.entity_id) return `/projects/${n.entity_id}`
  return '/notifications'
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [summary, setSummary] = useState<NotificationSummary | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [severity, setSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'facture_retard' | 'tache_retard' | 'prospect_inactif' | 'phase_echeance'>('all')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState('')

  const load = async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const [items, summaryData] = await Promise.all([
        getNotifications({
          unread_only: filter === 'unread',
          severity: severity === 'all' ? undefined : severity,
          type: typeFilter === 'all' ? undefined : typeFilter,
          limit: 200,
        }),
        getNotificationSummary(),
      ])
      setNotifications(items)
      setSummary(summaryData)
    } catch (err) {
      console.error(err)
      setNotice('Impossible de charger les notifications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
  }, [filter, severity, typeFilter])

  useEffect(() => {
    const timer = window.setInterval(() => load(false), 30000)
    return () => window.clearInterval(timer)
  }, [filter, severity, typeFilter])

  const setTransientNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const handleCheck = async () => {
    setChecking(true)
    try {
      const result = await checkNotifications()
      await load(false)
      setTransientNotice(result.count > 0 ? `${result.count} nouvelle(s) notification(s) détectée(s).` : 'Centre d’alertes synchronisé.')
    } catch (err: any) {
      setTransientNotice(err.message || 'Erreur lors de la vérification.')
    } finally {
      setChecking(false)
    }
  }

  const handleMarkRead = async (id: number) => {
    await markNotificationRead(id)
    await load(false)
  }

  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsRead()
    await load(false)
    setTransientNotice(`${result.count} notification(s) marquée(s) comme lues.`)
  }

  const handleDelete = async (id: number) => {
    await deleteNotification(id)
    await load(false)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bell size={24} className="text-accessia-600" />
            Alertes & Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">Relances, tâches sensibles, prospects silencieux et échéances à venir.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-2 rounded-lg bg-accessia-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accessia-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            Synchroniser
          </button>
          {(summary?.unread || 0) > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <CheckCheck size={16} />
              Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-accessia-200 bg-accessia-50 px-4 py-3 text-sm text-accessia-700">
          {notice}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard icon={Bell} label="Non lues" value={summary?.unread ?? 0} tone="blue" />
        <SummaryCard icon={AlertCircle} label="Critiques" value={summary?.critical ?? 0} tone="red" />
        <SummaryCard icon={AlertTriangle} label="Avertissements" value={summary?.warning ?? 0} tone="amber" />
        <SummaryCard icon={Info} label="Infos" value={summary?.info ?? 0} tone="slate" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <Filter size={12} />
          Filtres
        </div>
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>Toutes</FilterPill>
        <FilterPill active={filter === 'unread'} onClick={() => setFilter('unread')}>Non lues</FilterPill>
        <FilterPill active={severity === 'critical'} onClick={() => setSeverity(severity === 'critical' ? 'all' : 'critical')}>Critiques</FilterPill>
        <FilterPill active={severity === 'warning'} onClick={() => setSeverity(severity === 'warning' ? 'all' : 'warning')}>Avertissements</FilterPill>
        <FilterPill active={typeFilter === 'facture_retard'} onClick={() => setTypeFilter(typeFilter === 'facture_retard' ? 'all' : 'facture_retard')}>Factures</FilterPill>
        <FilterPill active={typeFilter === 'tache_retard'} onClick={() => setTypeFilter(typeFilter === 'tache_retard' ? 'all' : 'tache_retard')}>Tâches</FilterPill>
        <FilterPill active={typeFilter === 'prospect_inactif'} onClick={() => setTypeFilter(typeFilter === 'prospect_inactif' ? 'all' : 'prospect_inactif')}>Prospects</FilterPill>
      </div>

      <div className="space-y-3">
        {notifications.map(notification => {
          const cfg = severityConfig[notification.severity] || severityConfig.info
          const SeverityIcon = cfg.icon
          const EntityIcon = entityIcons[notification.entity_type || ''] || Info
          return (
            <div
              key={notification.id}
              className={`rounded-2xl border p-4 transition-colors ${notification.is_read ? 'border-gray-200 bg-white opacity-80' : cfg.bg}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${cfg.color}`}>
                  <SeverityIcon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-500">
                      <EntityIcon size={10} />
                      {typeLabels[notification.type] || notification.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {notification.created_at ? new Date(notification.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                  {notification.message && <p className="mt-1 text-sm text-gray-600">{notification.message}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={notificationHref(notification)} className="text-xs font-medium text-accessia-600 hover:underline">
                      Ouvrir l’élément
                    </Link>
                    {!notification.is_read && (
                      <button onClick={() => handleMarkRead(notification.id)} className="text-xs font-medium text-gray-500 hover:text-green-600">
                        Marquer comme lu
                      </button>
                    )}
                    <button onClick={() => handleDelete(notification.id)} className="text-xs font-medium text-gray-400 hover:text-red-500">
                      Supprimer
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(notification.id)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/60 hover:text-red-500"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}

        {notifications.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-gray-400">
            <BellOff size={42} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucune notification pour ce filtre.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-accessia-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: 'blue' | 'red' | 'amber' | 'slate' }) {
  const classes = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-600',
  }[tone]
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${classes}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}
