'use client'

import { useEffect, useState } from 'react'
import { getDashboard, DashboardData } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Users, FolderKanban, TrendingUp, Clock, CheckCircle, AlertCircle,
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

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard().then(setData).catch(e => setError(e.message))
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
        <p className="text-sm text-gray-500 mt-0.5">Vue d'ensemble SENSIA DVZ</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clients totaux" value={kpis.total_clients}
          sub={`${kpis.active_clients} actifs · ${kpis.prospects} prospects`}
          icon={Users} color="bg-sensia-500" />
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
            <Link href="/projects" className="text-xs text-sensia-500 hover:underline">Voir tout →</Link>
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
          <Link href="/clients" className="text-xs text-sensia-500 hover:underline">Voir tout →</Link>
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
                    <Link href={`/clients/${c.id}`} className="hover:text-sensia-600">{c.name}</Link>
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
