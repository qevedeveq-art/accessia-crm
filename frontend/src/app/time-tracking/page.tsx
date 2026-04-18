'use client'

import { useEffect, useState } from 'react'
import {
  Clock, Download, Plus, Trash2, BarChart3, Timer, DollarSign, TrendingUp,
} from 'lucide-react'
import {
  getTimeEntries, createTimeEntry, deleteTimeEntry, exportTimeEntriesCsv, getTimeEntriesSummary, getProjects,
  type TimeEntry, type TimeEntrySummary, type Project,
} from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function TimeTrackingPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [summaries, setSummaries] = useState<TimeEntrySummary[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tab, setTab] = useState<'entries' | 'summary'>('entries')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ project_id: '', description: '', duration_minutes: '', billable: true, hourly_rate: '' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [e, s, p] = await Promise.all([getTimeEntries(), getTimeEntriesSummary(), getProjects()])
      setEntries(e)
      setSummaries(s)
      setProjects(p)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async () => {
    if (!form.project_id || !form.description || !form.duration_minutes) return
    try {
      await createTimeEntry({
        project_id: Number(form.project_id),
        description: form.description,
        duration_minutes: Number(form.duration_minutes),
        billable: form.billable,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : undefined,
      })
      setForm({ project_id: '', description: '', duration_minutes: '', billable: true, hourly_rate: '' })
      setShowForm(false)
      load()
    } catch (err: any) { alert(err.message) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette entrée de temps ?')) return
    await deleteTimeEntry(id)
    load()
  }

  const totalHours = entries.reduce((s, e) => s + e.duration_minutes, 0) / 60
  const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.duration_minutes, 0) / 60
  const totalCost = entries.reduce((s, e) => s + (e.cost || 0), 0)

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m}min`
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock size={24} className="text-accessia-600" /> Suivi du Temps
          </h1>
          <p className="text-sm text-gray-500 mt-1">Suivez le temps passé par projet pour optimiser votre rentabilité</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg hover:bg-accessia-700 transition-colors text-sm font-medium">
          <Plus size={16} /> Saisir du temps
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Heures totales', value: `${totalHours.toFixed(1)}h`, icon: Clock, color: 'text-blue-600 bg-blue-50' },
          { label: 'Heures facturables', value: `${billableHours.toFixed(1)}h`, icon: Timer, color: 'text-green-600 bg-green-50' },
          { label: 'Montant facturable', value: `${totalCost.toFixed(0)} EUR`, icon: DollarSign, color: 'text-violet-600 bg-violet-50' },
          { label: 'Entrées ce mois', value: entries.length.toString(), icon: BarChart3, color: 'text-orange-600 bg-orange-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon size={18} /></div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setTab('entries')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'entries' ? 'bg-accessia-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Entrées de temps
        </button>
        <button onClick={() => setTab('summary')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'summary' ? 'bg-accessia-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Rentabilité par projet
        </button>
        <button
          onClick={() => exportTimeEntriesCsv().catch((err: Error) => alert(err.message))}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          title="Exporter les saisies en CSV"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {tab === 'entries' ? (
        <div className="bg-white rounded-xl border">
          <table className="w-full">
            <thead>
              <tr className="border-b text-xs text-gray-500 uppercase">
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Projet</th>
                <th className="text-left p-3">Description</th>
                <th className="text-center p-3">Durée</th>
                <th className="text-center p-3">Facturable</th>
                <th className="text-right p-3">Coût</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3 text-sm text-gray-600">{e.date ? new Date(e.date).toLocaleDateString('fr-FR') : '—'}</td>
                  <td className="p-3"><span className="font-mono text-xs text-accessia-600 bg-accessia-50 px-2 py-0.5 rounded">{e.project_code}</span> <span className="text-sm">{e.project_name}</span></td>
                  <td className="p-3 text-sm text-gray-700">{e.description}</td>
                  <td className="p-3 text-center text-sm font-medium">{formatDuration(e.duration_minutes)}</td>
                  <td className="p-3 text-center">{e.billable ? <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">Oui</span> : <span className="text-gray-400 text-xs">Non</span>}</td>
                  <td className="p-3 text-right text-sm font-medium">{e.cost != null ? `${e.cost.toFixed(2)} EUR` : '—'}</td>
                  <td className="p-3 text-right"><button onClick={() => handleDelete(e.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">Aucune entrée de temps</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Chart */}
          {summaries.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Budget consommé par projet (%)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={summaries}>
                  <XAxis dataKey="project_code" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="budget_consumed_pct" radius={[4, 4, 0, 0]}>
                    {summaries.map((s, i) => (
                      <Cell key={i} fill={s.budget_consumed_pct > 100 ? '#dc2626' : s.budget_consumed_pct > 75 ? '#d97706' : '#059669'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs text-gray-500 uppercase">
                  <th className="text-left p-3">Projet</th>
                  <th className="text-left p-3">Client</th>
                  <th className="text-right p-3">Budget</th>
                  <th className="text-right p-3">Heures</th>
                  <th className="text-right p-3">Coût réel</th>
                  <th className="text-right p-3">Consommé</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(s => (
                  <tr key={s.project_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-3"><span className="font-mono text-xs text-accessia-600">{s.project_code}</span> <span className="text-sm">{s.project_name}</span></td>
                    <td className="p-3 text-sm text-gray-600">{s.client_name || '—'}</td>
                    <td className="p-3 text-right text-sm font-medium">{s.budget ? `${s.budget.toLocaleString('fr-FR')} EUR` : '—'}</td>
                    <td className="p-3 text-right text-sm">{s.total_hours}h ({s.billable_hours}h fact.)</td>
                    <td className="p-3 text-right text-sm font-medium">{s.total_cost.toLocaleString('fr-FR')} EUR</td>
                    <td className="p-3 text-right">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        s.budget_consumed_pct > 100 ? 'bg-red-100 text-red-700' :
                        s.budget_consumed_pct > 75 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>{s.budget_consumed_pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Saisie */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Saisir du temps</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Projet *</label>
                <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="">Sélectionner...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Description *</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="Travail effectué..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Durée (minutes) *</label>
                  <input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="60" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Taux horaire (EUR)</label>
                  <input type="number" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="150" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })} className="rounded" />
                Facturable
              </label>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
              <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-accessia-600 text-white rounded-lg hover:bg-accessia-700 font-medium">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
