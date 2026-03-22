'use client'

import { useEffect, useState } from 'react'
import { getTasks, getActivities, getQuotes, getInvoices } from '@/lib/api'
import { CheckCircle2, Clock, FileText, CreditCard, Sun } from 'lucide-react'
import Link from 'next/link'

export default function TodayPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [pendingQuotes, setPendingQuotes] = useState<any[]>([])
  const [weekInvoices, setWeekInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    Promise.all([
      getTasks({ status: 'a_faire' }),
      getActivities({}),
      getQuotes({ status: 'envoye' }),
      getInvoices({ status: 'envoyee' }),
    ]).then(([t, a, q, inv]) => {
      // Tasks due today or overdue
      setTasks(t.filter((task: any) => {
        if (!task.due_date) return false
        return task.due_date.split('T')[0] <= todayStr
      }).slice(0, 10))
      // Activities in last 24h
      setActivities(a.filter((act: any) => act.date >= weekAgo).slice(0, 5))
      setPendingQuotes(q.slice(0, 5))
      setWeekInvoices(inv.slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-500">Chargement...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Sun size={28} className="text-yellow-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon Jour</h1>
          <p className="text-gray-500 text-sm">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tasks due today */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={18} className="text-blue-500" />
            <h2 className="font-semibold text-gray-800">Tâches du jour ({tasks.length})</h2>
          </div>
          {tasks.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune tâche en retard ou pour aujourd'hui 🎉</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map(t => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${t.priority === 'urgente' ? 'bg-red-500' : t.priority === 'haute' ? 'bg-orange-400' : 'bg-gray-300'}`} />
                  <div>
                    <p className="text-gray-800">{t.title}</p>
                    {t.due_date && <p className="text-gray-400 text-xs">{new Date(t.due_date).toLocaleDateString('fr-FR')}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent activities */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-purple-500" />
            <h2 className="font-semibold text-gray-800">Activités récentes</h2>
          </div>
          {activities.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune activité récente</p>
          ) : (
            <ul className="space-y-2">
              {activities.map(a => (
                <li key={a.id} className="text-sm">
                  <p className="text-gray-800">{a.title}</p>
                  <p className="text-gray-400 text-xs">{a.type} · {new Date(a.date).toLocaleDateString('fr-FR')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending quotes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-green-500" />
            <h2 className="font-semibold text-gray-800">Devis en attente de signature</h2>
          </div>
          {pendingQuotes.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucun devis en attente</p>
          ) : (
            <ul className="space-y-2">
              {pendingQuotes.map(q => (
                <li key={q.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="text-gray-800">{q.title}</p>
                    <p className="text-gray-400 text-xs">{q.client_name} · {q.number}</p>
                  </div>
                  <span className="font-medium text-gray-700">{q.amount_ttc?.toLocaleString('fr-FR')} €</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Week invoices */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-red-500" />
            <h2 className="font-semibold text-gray-800">Factures en attente</h2>
          </div>
          {weekInvoices.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune facture en attente</p>
          ) : (
            <ul className="space-y-2">
              {weekInvoices.map(inv => (
                <li key={inv.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="text-gray-800">{inv.number}</p>
                    <p className="text-gray-400 text-xs">{inv.client_name}</p>
                  </div>
                  <span className="font-medium text-gray-700">{inv.amount_ttc?.toLocaleString('fr-FR')} €</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
