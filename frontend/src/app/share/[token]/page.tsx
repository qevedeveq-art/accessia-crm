'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSharedDiagnostic, getDiagnosticPdfUrl, DiagnosticItem } from '@/lib/api'
import { Shield, Brain, Download, ExternalLink } from 'lucide-react'

export default function SharedDiagnosticPage() {
  const params = useParams()
  const token = params.token as string
  const [diag, setDiag] = useState<DiagnosticItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getSharedDiagnostic(token)
      .then(d => { setDiag(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Chargement du diagnostic…</div>
      </div>
    )
  }

  if (error || !diag) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Diagnostic non disponible</h1>
          <p className="text-gray-500 text-sm">
            {error || 'Ce lien de partage est invalide ou le diagnostic n\'est pas encore finalisé.'}
          </p>
        </div>
      </div>
    )
  }

  const results = diag.results
  if (!results) return null

  const globalScore = results.global_score ?? 0
  const scoreColor = globalScore >= 70 ? 'text-green-600' : globalScore >= 40 ? 'text-amber-600' : 'text-red-600'
  const scoreBg = globalScore >= 70 ? 'from-green-50 to-emerald-50' : globalScore >= 40 ? 'from-amber-50 to-yellow-50' : 'from-red-50 to-rose-50'
  const scoreLabel = globalScore >= 70 ? 'Conforme' : globalScore >= 40 ? 'Amélioration nécessaire' : 'Critique'
  const TypeIcon = diag.type === 'cyber' ? Shield : Brain
  const typeLabel = diag.type === 'cyber' ? 'Cybersécurité' : 'Opportunités IA'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* En-tête SENSIA */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#2850ff] flex items-center justify-center text-white font-bold text-sm">S</div>
          <div>
            <p className="font-semibold text-sm text-gray-900">ACCESSIA Pro</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Conseil IA · PME & Entrepreneurs</p>
          </div>
        </div>

        {/* Titre du diagnostic */}
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TypeIcon size={18} className={diag.type === 'cyber' ? 'text-red-600' : 'text-violet-600'} />
                <span className="text-xs font-medium text-gray-500">{typeLabel}</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{diag.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Client : {diag.client_name} · {diag.created_at ? new Date(diag.created_at).toLocaleDateString('fr-FR') : ''}
              </p>
            </div>
            <a href={getDiagnosticPdfUrl(diag.id)} target="_blank" rel="noopener"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#2850ff] text-white text-sm font-medium rounded-lg hover:bg-[#1e3fd4] transition-colors">
              <Download size={14} /> PDF
            </a>
          </div>
        </div>

        {/* Score global */}
        <div className={`bg-gradient-to-br ${scoreBg} rounded-2xl p-8 text-center mb-8 border`}>
          <p className="text-sm text-gray-500 mb-2">Score Global</p>
          <p className={`text-5xl font-bold ${scoreColor}`}>{globalScore}%</p>
          <p className={`text-sm font-semibold mt-2 ${scoreColor}`}>{scoreLabel}</p>
        </div>

        {/* Sections */}
        <div className="grid gap-4 mb-8">
          {(results.sections ?? []).map((sec: any) => {
            const pct = sec.score_pct ?? 0
            const c = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
            const tc = pct >= 70 ? 'text-green-700 bg-green-100' : pct >= 40 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
            return (
              <div key={sec.id} className="card p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{sec.title}</h3>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${tc}`}>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full mb-3">
                  <div className={`h-2 rounded-full transition-all ${c}`} style={{ width: `${pct}%` }} />
                </div>
                {sec.preconisations?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Préconisations</p>
                    <ul className="space-y-1">
                      {sec.preconisations.map((p: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-[#2850ff] mt-0.5">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-4 border-t">
          <p>Rapport généré par ACCESSIA Pro — Ce document est confidentiel</p>
          <p className="mt-1">ACCESSIA Pro © 2026 · Conseil IA · PME & Entrepreneurs</p>
        </div>
      </div>
    </div>
  )
}
