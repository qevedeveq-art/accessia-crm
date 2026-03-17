'use client'

import { useEffect, useState } from 'react'
import { getProject, updateProject, Project } from '@/lib/api'
import Link from 'next/link'
import { ArrowLeft, Edit2, Check, X, ExternalLink } from 'lucide-react'

const PHASE_LABELS = [
  'Découverte & Qualification',
  'Diagnostic & Cadrage',
  'Proposition & Contractualisation',
  'Mise en place & RGPD',
  'Développement & Intégration',
  'Tests & Validation',
  'Déploiement & Formation',
  'MCO — Maintenance Continue',
]

const STATUS_OPTS = ['en_cours', 'termine', 'suspendu', 'annule']

function Badge({ v }: { v: string }) {
  const cls: Record<string, string> = {
    en_cours: 'badge-en_cours', termine: 'badge-termine',
    suspendu: 'badge-suspendu', annule: 'badge-annule',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[v] ?? 'bg-gray-100 text-gray-600'}`}>{v.replace('_', ' ')}</span>
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Project>>({})
  const [saving, setSaving] = useState(false)

  const load = () => getProject(Number(params.id)).then(p => { setProject(p); setForm(p) })
  useEffect(() => { load() }, [params.id])

  const save = async () => {
    setSaving(true)
    await updateProject(Number(params.id), form)
    setSaving(false)
    setEditing(false)
    load()
  }

  if (!project) return <div className="p-8 text-gray-400 animate-pulse">Chargement…</div>

  const set = (k: string, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }))

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
  const fmt = (n?: number) => n ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '—'

  return (
    <div className="p-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/projects" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={14} /> Projets
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium">{project.code}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-sensia-600 bg-sensia-50 px-2 py-0.5 rounded border border-sensia-100">{project.code}</span>
            <span className="text-xs text-gray-400 uppercase">{project.type}</span>
            <Badge v={project.status} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Client : <Link href={`/clients/${project.client_id}`} className="text-sensia-600 hover:underline">{project.client_name}</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setForm(project) }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100">
                <X size={14} /> Annuler
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 bg-sensia-600 text-white rounded-lg text-sm hover:bg-sensia-700 disabled:opacity-60">
                <Check size={14} /> {saving ? '…' : 'Enregistrer'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Edit2 size={14} /> Modifier
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phase timeline */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Phases du projet</h2>
              {editing && (
                <select
                  value={form.phase ?? project.phase}
                  onChange={e => set('phase', Number(e.target.value))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sensia-300 outline-none"
                >
                  {PHASE_LABELS.map((l, i) => <option key={i} value={i}>Phase {i}</option>)}
                </select>
              )}
            </div>
            <div className="space-y-2">
              {PHASE_LABELS.map((label, i) => {
                const current = (editing ? form.phase : project.phase) ?? 0
                const done = i < current
                const active = i === current
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    active ? 'bg-sensia-50 border border-sensia-200' :
                    done ? 'bg-green-50' : 'bg-gray-50'
                  }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      done ? 'bg-green-500 text-white' :
                      active ? 'bg-sensia-500 text-white' :
                      'bg-gray-200 text-gray-400'
                    }`}>
                      {done ? '✓' : i}
                    </div>
                    <span className={`text-sm ${
                      active ? 'font-semibold text-sensia-900' :
                      done ? 'text-green-800' : 'text-gray-400'
                    }`}>{label}</span>
                    {active && <span className="ml-auto text-xs text-sensia-500 font-medium">En cours</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-3">Description</h2>
            {editing ? (
              <textarea
                value={(form.description as string) ?? ''}
                onChange={e => set('description', e.target.value)}
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sensia-300 outline-none resize-none"
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.description || <span className="text-gray-400">Aucune description</span>}</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Infos commerciales */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Infos commerciales</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Budget HT</p>
                {editing ? (
                  <input type="number" value={(form.budget as number) ?? ''}
                    onChange={e => set('budget', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-sensia-300 outline-none" />
                ) : (
                  <p className="font-semibold text-gray-900">{fmt(project.budget)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Statut</p>
                {editing ? (
                  <select value={(form.status as string) ?? project.status}
                    onChange={e => set('status', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-sensia-300 outline-none">
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                ) : <Badge v={project.status} />}
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-1.5">Début / Fin</p>
                <p className="text-gray-700">{fmtDate(project.start_date)} → {fmtDate(project.end_date)}</p>
              </div>
              <div className="pt-2 border-t border-gray-50 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  {editing ? (
                    <input type="checkbox" checked={(form.contract_signed as boolean) ?? project.contract_signed}
                      onChange={e => set('contract_signed', e.target.checked)} className="rounded text-sensia-600" />
                  ) : (
                    <span>{project.contract_signed ? '✅' : '❌'}</span>
                  )}
                  Contrat signé
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  {editing ? (
                    <input type="checkbox" checked={(form.gdpr_done as boolean) ?? project.gdpr_done}
                      onChange={e => set('gdpr_done', e.target.checked)} className="rounded text-sensia-600" />
                  ) : (
                    <span>{project.gdpr_done ? '✅' : '❌'}</span>
                  )}
                  RGPD validé
                </label>
              </div>
            </div>
          </div>

          {/* Dossier */}
          {project.folder_path && (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Dossier projet</p>
              <p className="text-xs text-gray-600 break-all font-mono">{project.folder_path.split(/[\\/]/).slice(-2).join('/')}</p>
              <Link href={`/files?path=${encodeURIComponent(project.folder_path)}`}
                className="mt-2 flex items-center gap-1 text-xs text-sensia-600 hover:underline">
                <ExternalLink size={11} /> Ouvrir dans l'explorateur
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
