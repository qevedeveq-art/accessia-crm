'use client'

import { useEffect, useState } from 'react'
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, FileText, ExternalLink,
} from 'lucide-react'
import { getRgpdDashboard, type RgpdDashboardData } from '@/lib/api'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  conforme: { label: 'Conforme', color: '#059669', bg: 'bg-green-50 text-green-700', icon: ShieldCheck },
  en_cours: { label: 'En cours', color: '#d97706', bg: 'bg-amber-50 text-amber-700', icon: ShieldAlert },
  non_conforme: { label: 'Non conforme', color: '#dc2626', bg: 'bg-red-50 text-red-700', icon: ShieldX },
}

export default function RgpdPage() {
  const [data, setData] = useState<RgpdDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')

  useEffect(() => {
    getRgpdDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>
  if (!data) return <div className="p-8 text-center text-red-500">Erreur de chargement</div>

  const pieData = [
    { name: 'Conforme', value: data.stats.conforme, color: '#059669' },
    { name: 'En cours', value: data.stats.en_cours, color: '#d97706' },
    { name: 'Non conforme', value: data.stats.non_conforme, color: '#dc2626' },
  ].filter(d => d.value > 0)

  const filteredRegistre = filterStatus
    ? data.registre.filter(r => r.rgpd_status === filterStatus)
    : data.registre

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={24} className="text-accessia-600" /> Conformite RGPD
          </h1>
          <p className="text-sm text-gray-500 mt-1">Registre des traitements et suivi de conformite par projet</p>
        </div>
      </div>

      {/* KPIs + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accessia-50 text-accessia-600 flex items-center justify-center"><Shield size={18} /></div>
          <div><p className="text-xs text-gray-500">Projets suivis</p><p className="text-lg font-bold">{data.stats.total_projects}</p></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3 cursor-pointer hover:border-green-300" onClick={() => setFilterStatus(filterStatus === 'conforme' ? '' : 'conforme')}>
          <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><ShieldCheck size={18} /></div>
          <div><p className="text-xs text-gray-500">Conformes</p><p className="text-lg font-bold text-green-600">{data.stats.conforme}</p></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3 cursor-pointer hover:border-amber-300" onClick={() => setFilterStatus(filterStatus === 'en_cours' ? '' : 'en_cours')}>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><ShieldAlert size={18} /></div>
          <div><p className="text-xs text-gray-500">En cours</p><p className="text-lg font-bold text-amber-600">{data.stats.en_cours}</p></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3 cursor-pointer hover:border-red-300" onClick={() => setFilterStatus(filterStatus === 'non_conforme' ? '' : 'non_conforme')}>
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><ShieldX size={18} /></div>
          <div><p className="text-xs text-gray-500">Non conformes</p><p className="text-lg font-bold text-red-600">{data.stats.non_conforme}</p></div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold" style={{ color: data.stats.taux_conformite >= 70 ? '#059669' : data.stats.taux_conformite >= 40 ? '#d97706' : '#dc2626' }}>
              {data.stats.taux_conformite}%
            </p>
            <p className="text-xs text-gray-500 mt-1">Taux de conformite</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      {pieData.length > 0 && (
        <div className="bg-white rounded-xl border p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Repartition de la conformite</h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                  <span className="text-gray-600">{d.name}</span>
                  <span className="font-bold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Registre */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Registre des traitements</h3>
          {filterStatus && (
            <button onClick={() => setFilterStatus('')} className="text-xs text-accessia-600 hover:underline mt-1">
              Retirer le filtre
            </button>
          )}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs text-gray-500 uppercase">
              <th className="text-left p-3">Projet</th>
              <th className="text-left p-3">Client</th>
              <th className="text-center p-3">Statut projet</th>
              <th className="text-center p-3">RGPD valide</th>
              <th className="text-center p-3">Fichier RGPD</th>
              <th className="text-center p-3">Conformite</th>
            </tr>
          </thead>
          <tbody>
            {filteredRegistre.map(r => {
              const cfg = statusConfig[r.rgpd_status] || statusConfig.non_conforme
              const StatusIcon = cfg.icon
              return (
                <tr key={r.project_id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <span className="font-mono text-xs text-accessia-600">{r.project_code}</span>
                    <span className="text-sm ml-2">{r.project_name}</span>
                  </td>
                  <td className="p-3 text-sm text-gray-600">{r.client_name || '—'}</td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.project_status === 'en_cours' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.project_status}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {r.gdpr_done ? <ShieldCheck size={16} className="inline text-green-600" /> : <ShieldX size={16} className="inline text-red-400" />}
                  </td>
                  <td className="p-3 text-center">
                    {r.gdpr_file_exists ? (
                      <span className="text-green-600 text-xs flex items-center justify-center gap-1"><FileText size={12} /> Present</span>
                    ) : (
                      <span className="text-red-400 text-xs">Absent</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 ${cfg.bg}`}>
                      <StatusIcon size={12} /> {cfg.label}
                    </span>
                  </td>
                </tr>
              )
            })}
            {filteredRegistre.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucun projet dans le registre</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
