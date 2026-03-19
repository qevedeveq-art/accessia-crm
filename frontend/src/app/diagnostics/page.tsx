'use client'

import { useEffect, useState } from 'react'
import {
  getDiagnostics, createDiagnostic, deleteDiagnostic, getDiagnosticPdfUrl,
  getClients, DiagnosticItem, DiagnosticCreate, Client,
} from '@/lib/api'
import Link from 'next/link'
import {
  Plus, Search, Shield, Brain, Trash2, Download, Share2,
  ClipboardCheck, ExternalLink, Filter, Scale,
} from 'lucide-react'

const TYPE_LABELS: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  cyber: { label: 'Cybersécurité',   icon: Shield, color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  ia:    { label: 'Opportunités IA', icon: Brain,  color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  rgpd:  { label: 'Conformité RGPD', icon: Scale,  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  en_cours: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  termine:  { label: 'Terminé', cls: 'bg-green-100 text-green-800' },
}

function Badge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${s.cls}`}>{s.label}</span>
}

function TypeBadge({ type }: { type: string }) {
  const t = TYPE_LABELS[type]
  if (!t) return <span className="text-xs text-gray-500">{type}</span>
  const Icon = t.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${t.bg} ${t.color}`}>
      <Icon size={13} /> {t.label}
    </span>
  )
}

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<DiagnosticCreate>({ client_id: 0, type: 'cyber', title: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<number | null>(null)

  const load = () => {
    getDiagnostics({
      type: typeFilter || undefined,
      status: statusFilter || undefined,
    }).then(setDiagnostics).catch(e => setError(e.message))
  }

  useEffect(() => { load() }, [typeFilter, statusFilter])
  useEffect(() => { getClients().then(setClients).catch(() => {}) }, [])

  const filtered = diagnostics.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.title.toLowerCase().includes(q) || (d.client_name ?? '').toLowerCase().includes(q)
  })

  // Regrouper par type
  const cyberDiags = filtered.filter(d => d.type === 'cyber')
  const iaDiags = filtered.filter(d => d.type === 'ia')

  const submit = async () => {
    if (!form.client_id) { setError('Sélectionnez un client'); return }
    if (!form.title.trim()) { setError('Le titre est requis'); return }
    setSaving(true); setError('')
    try {
      const created = await createDiagnostic(form)
      setOpen(false)
      setForm({ client_id: 0, type: 'cyber', title: '' })
      load()
      // Rediriger vers le diagnostic créé
      window.location.href = `/diagnostics/${created.id}`
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce diagnostic ?')) return
    try { await deleteDiagnostic(id); load() } catch (e: any) { setError(e.message) }
  }

  const copyShareLink = (d: DiagnosticItem) => {
    const url = `${window.location.origin}/share/${d.share_token}`
    navigator.clipboard.writeText(url)
    setCopied(d.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const rgpdDiags = filtered.filter(d => d.type === 'rgpd')

  const stats = {
    total: diagnostics.length,
    cyber: diagnostics.filter(d => d.type === 'cyber').length,
    ia: diagnostics.filter(d => d.type === 'ia').length,
    rgpd: diagnostics.filter(d => d.type === 'rgpd').length,
    termine: diagnostics.filter(d => d.status === 'termine').length,
    en_cours: diagnostics.filter(d => d.status === 'en_cours').length,
  }

  return (
    <div className="p-6 space-y-0">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck size={24} className="text-accessia-600" />
            Diagnostics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Diagnostics cybersécurité et opportunités IA pour vos clients
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouveau diagnostic
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Cybersécurité', value: stats.cyber, color: 'text-red-600' },
          { label: 'Opportunités IA', value: stats.ia, color: 'text-violet-600' },
          { label: 'RGPD', value: stats.rgpd, color: 'text-blue-600' },
          { label: 'Terminés', value: stats.termine, color: 'text-green-600' },
          { label: 'En cours', value: stats.en_cours, color: 'text-amber-600' },
        ].map((k, i) => (
          <div key={i} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Erreur */}
      {error && !open && (
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <span>{error}</span>
          <button onClick={() => { setError(''); load() }} className="ml-auto text-xs underline hover:text-red-900">Réessayer</button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par titre ou client…"
            className="input pl-9 w-full"
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input w-auto">
          <option value="">Tous les types</option>
          <option value="cyber">Cybersécurité</option>
          <option value="ia">Opportunités IA</option>
          <option value="rgpd">Conformité RGPD</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="">Tous les statuts</option>
          <option value="en_cours">En cours</option>
          <option value="termine">Terminé</option>
        </select>
      </div>

      {/* Liste par section */}
      {[
        { type: 'cyber', items: cyberDiags, label: 'Cybersécurité', icon: Shield, accent: 'border-l-red-500' },
        { type: 'ia',   items: iaDiags,    label: 'Opportunités IA', icon: Brain,  accent: 'border-l-violet-500' },
        { type: 'rgpd', items: rgpdDiags,  label: 'Conformité RGPD', icon: Scale,  accent: 'border-l-blue-500' },
      ].filter(section => !typeFilter || section.type === typeFilter).map(section => (
        <div key={section.type} className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <section.icon size={18} className={section.type === 'cyber' ? 'text-red-600' : section.type === 'rgpd' ? 'text-blue-600' : 'text-violet-600'} />
            {section.label}
            <span className="text-sm font-normal text-gray-400">({section.items.length})</span>
          </h2>

          {section.items.length === 0 ? (
            <div className="card p-6 text-center text-gray-400 text-sm">
              Aucun diagnostic {section.label.toLowerCase()} trouvé
            </div>
          ) : (
            <div className="grid gap-3">
              {section.items.map(d => {
                const score = d.results?.global_score
                const scoreColor = score != null ? (score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-600') : ''
                return (
                  <div key={d.id} className={`card p-4 border-l-4 ${section.accent} hover:shadow-md transition-shadow`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/diagnostics/${d.id}`} className="font-semibold text-gray-900 hover:text-accessia-600 truncate">
                            {d.title}
                          </Link>
                          <Badge status={d.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>Client : <Link href={`/clients/${d.client_id}`} className="text-accessia-600 hover:underline">{d.client_name}</Link></span>
                          <span>Réf : DIAG-{String(d.id).padStart(4, '0')}</span>
                          {d.created_at && <span>{new Date(d.created_at).toLocaleDateString('fr-FR')}</span>}
                          {score != null && (
                            <span className={`font-semibold ${scoreColor}`}>Score : {score}%</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link href={`/diagnostics/${d.id}`} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-accessia-600" title="Ouvrir">
                          <ExternalLink size={15} />
                        </Link>
                        {d.status === 'termine' && (
                          <>
                            <button onClick={() => copyShareLink(d)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Copier le lien de partage">
                              <Share2 size={15} />
                              {copied === d.id && <span className="absolute -mt-8 -ml-6 bg-gray-900 text-white text-[10px] px-2 py-0.5 rounded">Copié !</span>}
                            </button>
                            <a href={getDiagnosticPdfUrl(d.id)} target="_blank" rel="noopener" className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-green-600" title="Télécharger PDF">
                              <Download size={15} />
                            </a>
                          </>
                        )}
                        <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Supprimer">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Modale nouveau diagnostic */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
            <h2 className="text-lg font-bold mb-4">Nouveau diagnostic</h2>
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded mb-3">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="label">Client *</label>
                <select
                  value={form.client_id || ''}
                  onChange={e => setForm(f => ({ ...f, client_id: Number(e.target.value) }))}
                  className="input w-full"
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Type de diagnostic *</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { t: 'cyber' as const, sub: 'Basé sur le guide ANSSI' },
                    { t: 'ia' as const,    sub: 'Quick wins & opportunités' },
                    { t: 'rgpd' as const,  sub: 'Conformité Règlement UE 2016/679' },
                  ]).map(({ t, sub }) => {
                    const info = TYPE_LABELS[t]
                    const Icon = info.icon
                    const sel = form.type === t
                    const defaultTitles: Record<string, string> = {
                      cyber: 'Diagnostic Cybersécurité',
                      ia: 'Diagnostic Opportunités IA',
                      rgpd: 'Diagnostic Conformité RGPD',
                    }
                    return (
                      <button key={t}
                        onClick={() => setForm(f => ({ ...f, type: t, title: f.title || defaultTitles[t] }))}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          sel ? 'border-accessia-500 bg-accessia-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon size={20} className={sel ? 'text-accessia-600' : 'text-gray-400'} />
                        <p className={`font-medium text-sm mt-1 ${sel ? 'text-accessia-700' : 'text-gray-700'}`}>{info.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="label">Titre *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Diagnostic cybersécurité Q1 2026"
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setOpen(false); setError('') }} className="btn-secondary">Annuler</button>
              <button onClick={submit} disabled={saving} className="btn-primary">
                {saving ? 'Création…' : 'Créer & commencer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
