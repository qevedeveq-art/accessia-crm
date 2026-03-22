'use client'

import { useEffect, useState } from 'react'
import {
  Bell, BellOff, CheckCheck, Trash2, RefreshCw,
  AlertTriangle, AlertCircle, Info, FileText, Users, FolderKanban, CreditCard,
} from 'lucide-react'
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  checkNotifications, deleteNotification,
  type NotificationItem,
} from '@/lib/api'

const severityConfig: Record<string, { icon: any; color: string; bg: string }> = {
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
  tache_retard: 'Tache en retard',
  prospect_inactif: 'Prospect inactif',
  phase_echeance: 'Echeance projet',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  const load = async () => {
    try {
      const data = await getNotifications({ unread_only: filter === 'unread', limit: 200 })
      setNotifications(data)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  const handleCheck = async () => {
    setChecking(true)
    try {
      const result = await checkNotifications()
      if (result.count > 0) {
        alert(`${result.count} nouvelle(s) alerte(s) generee(s)`)
      } else {
        alert('Aucune nouvelle alerte')
      }
      load()
    } catch (err: any) { alert(err.message) }
    setChecking(false)
  }

  const handleMarkRead = async (id: number) => {
    await markNotificationRead(id)
    load()
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    load()
  }

  const handleDelete = async (id: number) => {
    await deleteNotification(id)
    load()
  }

  const unreadCount = notifications.filter(n => !n.is_read).length
  const criticalCount = notifications.filter(n => n.severity === 'critical' && !n.is_read).length
  const warningCount = notifications.filter(n => n.severity === 'warning' && !n.is_read).length

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-accessia-600" /> Alertes & Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">Factures en retard, prospects inactifs, echeances projets</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCheck} disabled={checking} className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg hover:bg-accessia-700 transition-colors text-sm font-medium disabled:opacity-50">
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} /> Verifier maintenant
          </button>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <CheckCheck size={16} /> Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Bell size={18} /></div>
          <div><p className="text-xs text-gray-500">Non lues</p><p className="text-lg font-bold">{unreadCount}</p></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><AlertCircle size={18} /></div>
          <div><p className="text-xs text-gray-500">Critiques</p><p className="text-lg font-bold text-red-600">{criticalCount}</p></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><AlertTriangle size={18} /></div>
          <div><p className="text-xs text-gray-500">Avertissements</p><p className="text-lg font-bold text-amber-600">{warningCount}</p></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-accessia-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Toutes ({notifications.length})
        </button>
        <button onClick={() => setFilter('unread')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'unread' ? 'bg-accessia-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Non lues
        </button>
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        {notifications.map(n => {
          const cfg = severityConfig[n.severity] || severityConfig.info
          const SevIcon = cfg.icon
          const EntityIcon = entityIcons[n.entity_type || ''] || Info
          return (
            <div key={n.id} className={`rounded-xl border p-4 transition-colors ${n.is_read ? 'bg-white border-gray-200 opacity-70' : cfg.bg}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${cfg.color}`}><SevIcon size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <EntityIcon size={10} /> {typeLabels[n.type] || n.type}
                    </span>
                    <span className="text-xs text-gray-400">{n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                  <p className="font-medium text-sm text-gray-900 mt-1">{n.title}</p>
                  {n.message && <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {!n.is_read && (
                    <button onClick={() => handleMarkRead(n.id)} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-green-600" title="Marquer comme lu">
                      <CheckCheck size={14} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(n.id)} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-red-500" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {notifications.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <BellOff size={40} className="mx-auto mb-3 opacity-40" />
            <p>Aucune notification</p>
          </div>
        )}
      </div>
    </div>
  )
}
