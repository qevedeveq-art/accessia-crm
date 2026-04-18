'use client'

import { useEffect, useState } from 'react'
import { getDashboard, getAlerts, DashboardData, AlertsData } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Users, FolderKanban, TrendingUp, Clock, CheckCircle, AlertCircle, AlertTriangle, Bell,
} from 'lucide-react'
import Link from 'next/link'

const PHASE_LABELS = [
  'Découverte', 'Diagnostic', 'Proposition', 'Setup RGPD',
  'Développement', 'Tests', 'Déploiement', 'MCO',
]

const STATUS_COLORS: Record<string, string> = {
  prospect:  'badge-prospect',
  active:    'badge-active',
  inactive:  'badge-inactive',
  en_cours:  'badge-en_cours',
  termine:   'badge-termine',
  suspendu:  'badge-suspendu',
  annule:    'badge-annule',
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[value] ?? 'bg-gray-100 text-gray-600'}`}>
      {value.replace('_', ' ')}
    </span>
  )
}

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  )
}

function AlertsWidget({ alerts }: { alerts: AlertsData }) {
  const total = alerts.overdue_invoices.length + alerts.overdue_tasks.length + alerts.silent_clients.length
  if (total === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={16} className="text-gray-500" />
        <h2 className="font-semibold text-gray-800">Alertes</h2>
        <span className="ml-auto text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">{total}</span>
      </div>
      <div className="space-y-2">
        {alerts.overdue_invoices.map(inv => (
          <Link key={inv.id} href="/finances" className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 transition-colors">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm text-gray-700 flex-1">
              Facture <strong>{inv.number}</strong> — {inv.client_name} en retard de <strong>{inv.days_late}j</strong>
            </span>
            <span className="text-xs text-red-600 font-medium">{inv.amount_ttc.toLocaleString('fr-FR')} €</span>
          </Link>
        ))}
        {alerts.overdue_tasks.map(t => (
          <Link key={t.id} href="/crm" className="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-50 transition-colors">
            <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
            <span className="text-sm text-gray-700 flex-1">
              Tâche <strong>{t.title}</strong> — {t.client_name} en retard de <strong>{t.days_late}j</strong>
            </span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${t.priority === 'haute' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{t.priority}</span>
          </Link>
        ))}
        {alerts.silent_clients.map(c => (
          <Link key={c.id} href="/crm" className="flex items-center gap-3 p-2 rounded-lg hover:bg-yellow-50 transition-colors">
            <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
            <span className="text-sm text-gray-700 flex-1">
              Lead silencieux : <strong>{c.name}</strong> — aucune activité depuis <strong>{c.days_silent}j</strong>
            </span>
            <span className="text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">{c.pipeline_stage}</span>
          </Link>
        ))}
        {alerts.upcoming_deadlines.slice(0, 3).map((d, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-sm text-gray-700 flex-1">
              Échéance dans <strong>{d.days_left}j</strong> : {d.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [alerts, setAlerts] = useState<AlertsData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard().then(setData).catch(e => setError(e.message))
    getAlerts().then(setAlerts).catch(() => {})
  }, [])

  if (error) {
    return (
      <div className="p-8 flex items-center gap-3 text-red-600">
        <AlertCircle size={20} />
        <span>Impossible de joindre l'API : {error}</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8 text-gray-400 animate-pulse">Chargement du tableau de bord…</div>
    )
  }

  const { kpis, phase_distribution, recent_projects, recent_clients } = data

  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-0.5">Vue d'ensemble ACCESSIA Pro</p>
      </div>

      {/* Onboarding */}
      {kpis.total_clients === 0 && kpis.total_projects === 0 && (
        <div className="bg-gradient-to-br from-accessia-50 to-white border border-accessia-100 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Bienvenue sur ACCESSIA Pro</h2>
          <p className="text-sm text-gray-500 mb-4">Commencez en 3 étapes pour exploiter tout le potentiel de votre CRM.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { step: '1', title: 'Créer un client', desc: 'Ajoutez votre premier client ou prospect', href: '/clients?new=1' },
              { step: '2', title: 'Créer un projet', desc: 'Associez une mission à ce client', href: '/projects' },
              { step: '3', title: 'Rédiger un devis', desc: 'Générez votre première proposition commerciale', href: '/devis' },
            ].map(s => (
              <a key={s.step} href={s.href}
                className="bg-white border border-gray-100 rounded-xl p-4 hover:border-accessia-300 hover:shadow-sm transition-all group">
                <div className="w-7 h-7 rounded-lg bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-sm mb-2 group-hover:bg-accessia-600 group-hover:text-white transition-colors">
                  {s.step}
                </div>
                <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Alertes */}
      {alerts && <AlertsWidget alerts={alerts} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clients totaux" value={kpis.total_clients}
          sub={`${kpis.active_clients} actifs · ${kpis.prospects} prospects`}
          icon={Users} color="bg-accessia-500" />
        <KpiCard label="Projets actifs" value={kpis.active_projects}
          sub={`${kpis.total_projects} au total`}
          icon={FolderKanban} color="bg-violet-500" />
        <KpiCard label="CA encaissé" value={fmt(kpis.ca_total)}
          sub={`${fmt(kpis.ca_pending)} en attente`}
          icon={CheckCircle} color="bg-emerald-500" />
        <KpiCard label="Pipeline" value={fmt(kpis.pipeline)}
          sub="projets en cours"
          icon={TrendingUp} color="bg-amber-500" />
      </div>

      {/* Graphe phases + Activité récente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Distribution par phase */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-4">Projets par phase</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={phase_distribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="phase" tickFormatter={i => `P${i}`} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) => [v, 'Projets']}
                labelFormatter={(l) => PHASE_LABELS[l as number] ?? `Phase ${l}`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {phase_distribution.map((_, i) => (
                  <Cell key={i} fill={`hsl(${220 + i * 15}, 70%, ${55 - i * 3}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Projets récents */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Projets récents</h2>
            <Link href="/projects" className="text-xs text-accessia-500 hover:underline">Voir tout →</Link>
          </div>
          <div className="space-y-3">
            {recent_projects.length === 0 && (
              <p className="text-sm text-gray-400">Aucun projet pour l'instant.</p>
            )}
            {recent_projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.code} · {p.client_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Phase {p.phase}</span>
                  <Badge value={p.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Clients récents */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Clients récents</h2>
          <Link href="/clients" className="text-xs text-accessia-500 hover:underline">Voir tout →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Nom</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Secteur</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Statut</th>
              </tr>
            </thead>
            <tbody>
              {recent_clients.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-gray-400 text-center">Aucun client</td></tr>
              )}
              {recent_clients.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/clients/${c.id}`} className="hover:text-accessia-600">{c.name}</Link>
                  </td>
                  <td className="py-2 pr-4 text-gray-500 uppercase text-xs">{c.type}</td>
                  <td className="py-2 pr-4 text-gray-500">{c.sector || '—'}</td>
                  <td className="py-2"><Badge value={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
