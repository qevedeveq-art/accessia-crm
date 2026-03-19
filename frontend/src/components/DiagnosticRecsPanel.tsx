'use client'

import { useEffect, useState } from 'react'
import {
  getDiagnostics, updateDiagnostic, DiagnosticItem, DiagnosticResults, DiagnosticSectionResult,
} from '@/lib/api'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Check, X, ExternalLink } from 'lucide-react'

interface Props {
  clientId: number
}

function ScoreBar({ score }: { score: number }) {
  const color = score < 50 ? 'bg-red-500' : score < 75 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-8 text-right">{Math.round(score)}%</span>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    cyber: 'bg-blue-100 text-blue-800',
    ia:    'bg-violet-100 text-violet-800',
  }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${cfg[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  )
}

export default function DiagnosticRecsPanel({ clientId }: Props) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editMap, setEditMap] = useState<Record<number, DiagnosticResults>>({})
  const [saving, setSaving] = useState<number | null>(null)

  const load = () => {
    getDiagnostics({ client_id: clientId })
      .then(list => setDiagnostics(list))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [clientId])

  // ── Helpers editing ──────────────────────────────────────

  const startEdit = (diag: DiagnosticItem) => {
    if (!diag.results) return
    setEditMap(prev => ({ ...prev, [diag.id]: JSON.parse(JSON.stringify(diag.results)) }))
    setExpanded(diag.id)
  }

  const cancelEdit = (diagId: number) =>
    setEditMap(prev => { const n = { ...prev }; delete n[diagId]; return n })

  const saveEdit = async (diagId: number) => {
    setSaving(diagId)
    await updateDiagnostic(diagId, { results: editMap[diagId] as any })
    setSaving(null)
    cancelEdit(diagId)
    load()
  }

  const mutate = (diagId: number, fn: (r: DiagnosticResults) => void) =>
    setEditMap(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      fn(next[diagId])
      return next
    })

  const setRec = (diagId: number, si: number, ri: number, val: string) =>
    mutate(diagId, r => { r.sections[si].preconisations[ri] = val })

  const addRec = (diagId: number, si: number) =>
    mutate(diagId, r => { r.sections[si].preconisations.push('') })

  const deleteRec = (diagId: number, si: number, ri: number) =>
    mutate(diagId, r => { r.sections[si].preconisations.splice(ri, 1) })

  // ── Render ────────────────────────────────────────────────

  if (loading) return <div className="py-6 text-center text-gray-400 text-sm animate-pulse">Chargement…</div>

  if (diagnostics.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 text-center shadow-sm">
        <p className="text-sm text-gray-400">Aucun diagnostic pour ce client</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {diagnostics.map(diag => {
        const isExpanded = expanded === diag.id
        const isEditing = diag.id in editMap
        const results: DiagnosticResults | undefined = isEditing ? editMap[diag.id] : diag.results

        return (
          <div key={diag.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4">
              <button
                onClick={() => setExpanded(isExpanded ? null : diag.id)}
                className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              <TypeBadge type={diag.type} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{diag.title}</p>
                {results && (
                  <div className="mt-1 w-40">
                    <ScoreBar score={results.global_score} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  diag.status === 'termine' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {diag.status === 'termine' ? 'Terminé' : 'En cours'}
                </span>

                <Link href={`/diagnostics/${diag.id}`}
                  className="p-1.5 text-gray-400 hover:text-accessia-600 rounded hover:bg-accessia-50 transition-colors"
                  title="Ouvrir le diagnostic">
                  <ExternalLink size={14} />
                </Link>

                {results && !isEditing && (
                  <button
                    onClick={() => startEdit(diag)}
                    className="p-1.5 text-gray-400 hover:text-accessia-600 rounded hover:bg-accessia-50 transition-colors"
                    title="Modifier les recommandations"
                  >
                    <Edit2 size={14} />
                  </button>
                )}

                {isEditing && (
                  <>
                    <button
                      onClick={() => cancelEdit(diag.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                      title="Annuler"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => saveEdit(diag.id)}
                      disabled={saving === diag.id}
                      className="flex items-center gap-1 px-3 py-1 bg-accessia-600 text-white rounded-lg text-xs font-medium hover:bg-accessia-700 disabled:opacity-60"
                    >
                      <Check size={12} />
                      {saving === diag.id ? '…' : 'Sauvegarder'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Sections + recommandations */}
            {isExpanded && results && (
              <div className="border-t border-gray-50 divide-y divide-gray-50">
                {results.sections.map((section: DiagnosticSectionResult, si: number) => (
                  <div key={section.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{section.title}</p>
                      <div className="w-28">
                        <ScoreBar score={section.score_pct} />
                      </div>
                    </div>

                    {section.preconisations.length === 0 && !isEditing && (
                      <p className="text-xs text-gray-400 italic">Aucune recommandation</p>
                    )}

                    <ul className="space-y-1.5">
                      {section.preconisations.map((rec: string, ri: number) => (
                        <li key={ri} className="flex items-start gap-2">
                          {isEditing ? (
                            <>
                              <input
                                value={rec}
                                onChange={e => setRec(diag.id, si, ri, e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-accessia-300 outline-none"
                                placeholder="Recommandation…"
                              />
                              <button
                                onClick={() => deleteRec(diag.id, si, ri)}
                                className="mt-1.5 p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50 shrink-0"
                                title="Supprimer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accessia-400 shrink-0" />
                              <span className="text-sm text-gray-700">{rec}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>

                    {isEditing && (
                      <button
                        onClick={() => addRec(diag.id, si)}
                        className="mt-2 flex items-center gap-1 text-xs text-accessia-600 hover:text-accessia-800 font-medium"
                      >
                        <Plus size={12} /> Ajouter une recommandation
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isExpanded && !results && (
              <div className="border-t border-gray-50 px-5 py-6 text-center">
                <p className="text-sm text-gray-400">Ce diagnostic n'a pas encore de résultats.</p>
                <Link href={`/diagnostics/${diag.id}`} className="text-xs text-accessia-600 hover:underline mt-1 block">
                  Compléter le diagnostic →
                </Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
