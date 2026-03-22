'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Building2, FolderKanban, CreditCard, ClipboardCheck,
  CheckCircle, Clock, AlertCircle, ExternalLink,
} from 'lucide-react'
import { getClientPortal, type ClientPortalData } from '@/lib/api'

const statusColors: Record<string, string> = {
  en_cours: 'bg-blue-50 text-blue-700',
  termine: 'bg-green-50 text-green-700',
  suspendu: 'bg-amber-50 text-amber-700',
  annule: 'bg-red-50 text-red-700',
  brouillon: 'bg-gray-100 text-gray-600',
  envoyee: 'bg-amber-50 text-amber-700',
  payee: 'bg-green-50 text-green-700',
}

export default function ClientPortalPage() {
  const { token } = useParams()
  const [data, setData] = useState<ClientPortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof token === 'string') {
      getClientPortal(token)
        .then(setData)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [token])

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="text-gray-400">Chargement du portail...</div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide ou expire</h1>
        <p className="text-sm text-gray-500">{error || 'Ce portail client n\'est plus accessible.'}</p>
      </div>
    </div>
  )

  const totalInvoiced = data.invoices.reduce((s, i) => s + i.amount_ttc, 0)
  const totalPaid = data.invoices.filter(i => i.status === 'payee').reduce((s, i) => s + i.amount_ttc, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accessia-600 flex items-center justify-center text-white font-bold">A</div>
            <div>
              <p className="font-semibold text-gray-900">ACCESSIA Pro</p>
              <p className="text-xs text-gray-500">Portail Client</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-gray-400" />
            <span className="font-medium text-gray-700">{data.client_name}</span>
            {data.sector && <span className="text-xs text-gray-400 ml-1">({data.sector})</span>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Projets */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <FolderKanban size={20} className="text-accessia-600" /> Vos projets
          </h2>
          {data.projects.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun projet en cours</p>
          ) : (
            <div className="grid gap-4">
              {data.projects.map(p => (
                <div key={p.code} className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono text-xs text-accessia-600 bg-accessia-50 px-2 py-0.5 rounded mr-2">{p.code}</span>
                      <span className="font-semibold text-gray-900">{p.name}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    Phase actuelle : <strong>{p.phase_label}</strong>
                    {p.start_date && <span className="ml-4 text-gray-400">Debut : {new Date(p.start_date).toLocaleDateString('fr-FR')}</span>}
                    {p.end_date && <span className="ml-2 text-gray-400">Fin : {new Date(p.end_date).toLocaleDateString('fr-FR')}</span>}
                  </div>
                  {/* Progress bar */}
                  <div className="flex gap-1">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className={`h-2 flex-1 rounded-full ${i <= p.phase ? 'bg-accessia-500' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">{p.progress_pct}% complete</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Factures */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <CreditCard size={20} className="text-accessia-600" /> Vos factures
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Total facture TTC</p>
              <p className="text-xl font-bold text-gray-900">{totalInvoiced.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} EUR</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Total paye</p>
              <p className="text-xl font-bold text-green-600">{totalPaid.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} EUR</p>
            </div>
          </div>
          {data.invoices.length > 0 ? (
            <div className="bg-white rounded-xl border">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase">
                    <th className="text-left p-3">N</th>
                    <th className="text-right p-3">Montant TTC</th>
                    <th className="text-center p-3">Statut</th>
                    <th className="text-center p-3">Emission</th>
                    <th className="text-center p-3">Echeance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map(inv => (
                    <tr key={inv.number} className="border-b last:border-0">
                      <td className="p-3 font-mono text-sm">{inv.number}</td>
                      <td className="p-3 text-right font-medium">{inv.amount_ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} EUR</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[inv.status] || 'bg-gray-100'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3 text-center text-sm text-gray-600">{inv.issued_date ? new Date(inv.issued_date).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="p-3 text-center text-sm text-gray-600">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('fr-FR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucune facture</p>
          )}
        </section>

        {/* Diagnostics */}
        {data.diagnostics.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
              <ClipboardCheck size={20} className="text-accessia-600" /> Vos diagnostics
            </h2>
            <div className="grid gap-4">
              {data.diagnostics.map(d => (
                <div key={d.share_token} className="bg-white rounded-xl border p-5 flex items-center justify-between">
                  <div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.type === 'cyber' ? 'bg-red-50 text-red-700' : 'bg-violet-50 text-violet-700'}`}>
                      {d.type === 'cyber' ? 'Cybersecurite' : 'IA'}
                    </span>
                    <p className="font-medium text-gray-900 mt-1">{d.title}</p>
                    {d.created_at && <p className="text-xs text-gray-400 mt-0.5">{new Date(d.created_at).toLocaleDateString('fr-FR')}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    {d.global_score != null && (
                      <div className="text-center">
                        <p className="text-2xl font-bold" style={{ color: d.global_score >= 70 ? '#059669' : d.global_score >= 40 ? '#d97706' : '#dc2626' }}>
                          {d.global_score}%
                        </p>
                        <p className="text-xs text-gray-400">Score</p>
                      </div>
                    )}
                    <a href={`/share/${d.share_token}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-sm text-accessia-600 hover:underline">
                      Voir <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-6 text-center text-xs text-gray-400">
        Portail client propulse par ACCESSIA Pro &mdash; Conseil IA pour PME & Entrepreneurs
      </footer>
    </div>
  )
}
