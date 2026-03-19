'use client'

import { useEffect, useState, Suspense } from 'react'
import { getProjects, createProject, getClients, Project, Client, ProjectCreate } from '@/lib/api'
import Link from 'next/link'
import { Plus, Search, FolderKanban } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

const TYPE_OPTS   = ['diagnostic', 'integration', 'formation', 'mco', 'pack_pme', 'cyber', 'ia']

const PROJECT_TEMPLATES = [
  { id: 'cyber', label: 'Diagnostic Cyber', icon: '🔐', type: 'cyber', phase: 1, budget: 8000, description: 'Audit de sécurité informatique : analyse des vulnérabilités, RGPD, PCA/PRA.' },
  { id: 'ia', label: 'Accompagnement IA', icon: '🤖', type: 'ia', phase: 1, budget: 30000, description: 'Cadrage stratégique IA, sélection use cases, pilote et déploiement.' },
  { id: 'formation', label: 'Formation IA', icon: '🎓', type: 'formation', phase: 1, budget: 5000, description: 'Formation IA sur mesure pour les équipes : sensibilisation et ateliers pratiques.' },
  { id: 'pack_pme', label: 'Pack PME', icon: '🏢', type: 'pack_pme', phase: 1, budget: 12000, description: 'Pack complet transformation numérique pour PME : diagnostic + formation + accompagnement.' },
]
const STATUS_OPTS = ['en_cours', 'termine', 'suspendu', 'annule']
const PHASE_LABELS = [
  'Phase 0 — Découverte', 'Phase 1 — Diagnostic', 'Phase 2 — Proposition',
  'Phase 3 — Setup RGPD', 'Phase 4 — Développement', 'Phase 5 — Tests',
  'Phase 6 — Déploiement', 'Phase 7 — MCO',
]

function Badge({ v }: { v: string }) {
  const cls: Record<string, string> = {
    en_cours: 'badge-en_cours', termine: 'badge-termine',
    suspendu: 'badge-suspendu', annule: 'badge-annule',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[v] ?? 'bg-gray-100 text-gray-600'}`}>{v.replace('_', ' ')}</span>
}

function PhaseBar({ phase }: { phase: number }) {
  return (
    <div className="flex gap-0.5 mt-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < phase ? 'bg-accessia-500' : i === phase ? 'bg-accessia-300' : 'bg-gray-100'
          }`}
        />
      ))}
    </div>
  )
}

function getProjectHealth(p: Project): 'green' | 'yellow' | 'red' {
  const now = new Date()
  if (p.status === 'suspendu') return 'red'
  if (p.status !== 'en_cours') return 'green'
  if (p.end_date) {
    const end = new Date(p.end_date)
    const daysLeft = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    if (daysLeft < 0) return 'red'
    if (daysLeft < 14) return 'yellow'
  }
  if (p.updated_at) {
    const updated = new Date(p.updated_at)
    const daysSinceUpdate = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate > 15) return 'yellow'
  }
  return 'green'
}

function HealthDot({ health }: { health: 'green' | 'yellow' | 'red' }) {
  const colors = { green: 'bg-green-500', yellow: 'bg-yellow-400', red: 'bg-red-500' }
  const titles = { green: 'On track', yellow: 'À surveiller', red: 'En danger' }
  return <span title={titles[health]} className={`w-2 h-2 rounded-full ${colors[health]} shrink-0`} />
}

const EMPTY: ProjectCreate = {
  name: '', client_id: 0, type: 'integration', status: 'en_cours',
  phase: 0, description: '', budget: undefined, contract_signed: false,
  gdpr_done: false, notes: '',
}

function ProjectsPageInner() {
  const searchParams = useSearchParams()
  const preClientId = searchParams.get('client_id')

  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ProjectCreate>({
    ...EMPTY,
    client_id: preClientId ? Number(preClientId) : 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const load = () =>
    getProjects({ status: filter || undefined, search: search || undefined })
      .then(setProjects)
      .catch(e => setError(e.message))

  useEffect(() => { load() }, [filter, search])
  useEffect(() => { getClients().then(setClients) }, [])

  const set = (k: keyof ProjectCreate, v: string | number | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { setError('Le nom du projet est requis'); return }
    if (!form.client_id)   { setError('Veuillez sélectionner un client'); return }
    setSaving(true)
    setError('')
    try {
      await createProject(form)
      setOpen(false)
      setForm(EMPTY)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} projet(s)</p>
        </div>
        <button
          onClick={() => { setOpen(true); setError(''); setSelectedTemplate(null) }}
          className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accessia-700 transition-colors"
        >
          <Plus size={16} /> Nouveau projet
        </button>
      </div>

      {/* Erreur API */}
      {error && !open && (
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <span>Impossible de joindre l'API : {error}</span>
          <button onClick={() => { setError(''); load() }} className="ml-auto text-xs underline hover:text-red-900">Réessayer</button>
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-accessia-300 outline-none" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-accessia-300 outline-none">
          <option value="">Tous les statuts</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="grid gap-3">
        {projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <FolderKanban size={40} className="mx-auto mb-3 opacity-40" />
            <p>Aucun projet trouvé.</p>
          </div>
        )}
        {projects.map(p => (
          <Link key={p.id} href={`/projects/${p.id}`}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-accessia-500 bg-accessia-50 px-2 py-0.5 rounded">{p.code}</span>
                  <span className="text-xs text-gray-400 uppercase">{p.type}</span>
                </div>
                <p className="font-semibold text-gray-900 mt-1 flex items-center gap-2">
                  <HealthDot health={getProjectHealth(p)} />
                  {p.name}
                </p>
                <p className="text-sm text-gray-400 mt-0.5">{p.client_name}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge v={p.status} />
                {p.budget && (
                  <span className="text-xs font-medium text-gray-600">
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p.budget)} HT
                  </span>
                )}
                <div className="flex gap-2 text-xs">
                  {p.contract_signed && <span title="Contrat signé" className="text-green-500">✅ Contrat</span>}
                  {p.gdpr_done && <span title="RGPD validé" className="text-green-500">🔒 RGPD</span>}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>{PHASE_LABELS[p.phase]}</span>
                <span>{p.phase}/7</span>
              </div>
              <PhaseBar phase={p.phase} />
            </div>
          </Link>
        ))}
      </div>

      {/* Modal nouveau projet */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nouveau projet</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Le dossier sera créé automatiquement dans <code className="text-xs bg-gray-100 px-1 rounded">05_PROJETS/</code>
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Templates de missions */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-0.5">Partir d'un modèle</p>
                <p className="text-xs text-gray-400 mb-3">(optionnel — pré-remplit le formulaire)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROJECT_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplate(tpl.id)
                        setForm(f => ({
                          ...f,
                          type: tpl.type,
                          phase: tpl.phase,
                          budget: tpl.budget,
                          description: tpl.description,
                        }))
                      }}
                      className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors ${
                        selectedTemplate === tpl.id
                          ? 'border-accessia-500 bg-accessia-50'
                          : 'border-gray-200 hover:border-accessia-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl leading-none">{tpl.icon}</span>
                      <span className="text-xs font-semibold text-gray-800 leading-tight">{tpl.label}</span>
                      <span className="text-xs text-gray-400">
                        {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(tpl.budget)} HT
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom du projet *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="Ex: Intégration IA Service Client" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                  <select value={form.client_id} onChange={e => set('client_id', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    <option value={0}>— Sélectionner un client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    {TYPE_OPTS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phase initiale</label>
                  <select value={form.phase} onChange={e => set('phase', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    {PHASE_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Budget HT (€)</label>
                  <input type="number" value={form.budget ?? ''} onChange={e => set('budget', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="15000" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                  <input type="date" value={form.start_date?.slice(0, 10) ?? ''} onChange={e => set('start_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin prévue</label>
                  <input type="date" value={form.end_date?.slice(0, 10) ?? ''} onChange={e => set('end_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
                    placeholder="Objectifs, périmètre, livrables attendus…" />
                </div>

                <div className="col-span-2 flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={form.contract_signed} onChange={e => set('contract_signed', e.target.checked)} className="rounded text-accessia-600" />
                    Contrat signé
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={form.gdpr_done} onChange={e => set('gdpr_done', e.target.checked)} className="rounded text-accessia-600" />
                    RGPD validé
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setOpen(false); setError(''); setSelectedTemplate(null) }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={submit} disabled={saving}
                className="px-5 py-2 bg-accessia-600 text-white rounded-lg text-sm font-medium hover:bg-accessia-700 disabled:opacity-60">
                {saving ? 'Création…' : 'Créer le projet + dossier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 animate-pulse">Chargement…</div>}>
      <ProjectsPageInner />
    </Suspense>
  )
}
