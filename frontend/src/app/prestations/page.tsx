'use client'

import { useState, useEffect } from 'react'
import { getPrestations, savePrestations, Prestation } from '@/lib/api'
import {
  Plus, Pencil, Trash2, Save, X, CheckCircle, XCircle,
  Package, Euro, Clock, Users, Tag, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'

// ─── Category config ──────────────────────────────────────────

const CATEGORIES = ['Diagnostic', 'Audit', 'Accompagnement', 'Formation', 'Développement', 'Maintenance'] as const

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Diagnostic:     { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  Audit:          { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Accompagnement: { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  Formation:      { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  Développement:  { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200' },
  Maintenance:    { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
}

function catStyle(cat: string) {
  return CAT_COLORS[cat] ?? { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' }
}

// ─── Blank prestation ─────────────────────────────────────────

function blank(): Prestation {
  return { id: '', name: '', category: 'Diagnostic', price_ht: null, price_max: null, duration: '', target: '', active: true, description: '', deliverables: [], financing: [] }
}

// ─── Edit Modal ───────────────────────────────────────────────

function EditModal({
  prestation, onSave, onClose,
}: {
  prestation: Prestation
  onSave: (p: Prestation) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Prestation>({ ...prestation })
  const [deliverablesText, setDeliverablesText] = useState((prestation.deliverables || []).join('\n'))
  const [financingText, setFinancingText] = useState((prestation.financing || []).join('\n'))
  const set = (k: keyof Prestation, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.name.trim()) return
    const id = form.id || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const deliverables = deliverablesText.split('\n').map(s => s.trim()).filter(Boolean)
    const financing = financingText.split('\n').map(s => s.trim()).filter(Boolean)
    onSave({ ...form, id, deliverables, financing })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            {prestation.id ? 'Modifier la prestation' : 'Nouvelle prestation'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Nom *</label>
            <input
              value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex. Diag Data IA — BPI France"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none"
              autoFocus
            />
          </div>

          {/* Catégorie + Actif */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Catégorie</label>
              <select
                value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none bg-white"
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Statut</label>
              <button
                type="button"
                onClick={() => set('active', !form.active)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  form.active
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                {form.active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {form.active ? 'Actif' : 'Inactif'}
              </button>
            </div>
          </div>

          {/* Prix min + Prix max */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Prix HT (€)</label>
              <div className="relative">
                <Euro size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="number" min="0"
                  value={form.price_ht ?? ''} onChange={e => set('price_ht', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0 = Sur devis"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Prix max HT (€) <span className="font-normal text-gray-300">optionnel</span></label>
              <div className="relative">
                <Euro size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="number" min="0"
                  value={form.price_max ?? ''} onChange={e => set('price_max', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Fourchette haute"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Durée */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Durée</label>
            <input
              value={form.duration} onChange={e => set('duration', e.target.value)}
              placeholder="Ex. 2 jours, 3 mois…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none"
            />
          </div>

          {/* Cible */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Public cible</label>
            <input
              value={form.target} onChange={e => set('target', e.target.value)}
              placeholder="Ex. PME, ETI, TPE ≤ 250 salariés"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Décrivez le contenu et les objectifs de cette prestation…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
            />
          </div>

          {/* Livrables */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Livrables <span className="font-normal text-gray-300">un par ligne</span></label>
            <textarea
              value={deliverablesText}
              onChange={e => setDeliverablesText(e.target.value)}
              rows={3}
              placeholder={'Rapport de diagnostic\nRoadmap priorisée\nPrésentation décideurs'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
            />
          </div>

          {/* Financement */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Financement éligible <span className="font-normal text-gray-300">un par ligne</span></label>
            <textarea
              value={financingText}
              onChange={e => setFinancingText(e.target.value)}
              rows={2}
              placeholder={'BPI France\nOPCO\nChèques France Num'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="flex-1 bg-accessia-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Save size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Prestation Card ──────────────────────────────────────────

function PrestationCard({
  prestation, onEdit, onDelete, onToggleActive,
}: {
  prestation: Prestation
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const c = catStyle(prestation.category)
  const priceLabel = prestation.price_ht
    ? prestation.price_max && prestation.price_max > prestation.price_ht
      ? `${prestation.price_ht.toLocaleString('fr-FR')} – ${prestation.price_max.toLocaleString('fr-FR')} € HT`
      : `${prestation.price_ht.toLocaleString('fr-FR')} € HT`
    : 'Sur devis'

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-opacity ${!prestation.active ? 'opacity-60' : ''} ${c.border}`}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                {prestation.category}
              </span>
              {!prestation.active && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactif</span>
              )}
            </div>
            <h3 className="font-bold text-gray-900 leading-snug">{prestation.name}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} title="Modifier" className="p-1.5 text-gray-400 hover:text-accessia-600 hover:bg-accessia-50 rounded-lg transition-colors">
              <Pencil size={14} />
            </button>
            <button onClick={onDelete} title="Supprimer" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
          {prestation.price_ht !== null && (
            <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
              <Euro size={11} />{priceLabel}
            </span>
          )}
          {prestation.price_ht === null && (
            <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
              <Euro size={11} />Sur devis
            </span>
          )}
          {prestation.duration && (
            <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
              <Clock size={11} />{prestation.duration}
            </span>
          )}
          {prestation.target && (
            <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
              <Users size={11} />{prestation.target}
            </span>
          )}
        </div>

        {/* Description */}
        {prestation.description && (
          <>
            <p className={`text-xs text-gray-500 leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
              {prestation.description}
            </p>
            {prestation.description.length > 100 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-1.5 transition-colors"
              >
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {expanded ? 'Voir moins' : 'Voir plus'}
              </button>
            )}
          </>
        )}

        {/* Financement badges */}
        {prestation.financing && prestation.financing.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {prestation.financing.map(f => (
              <span key={f} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Toggle active */}
        <button
          onClick={onToggleActive}
          className={`mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            prestation.active
              ? 'border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
              : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
          }`}
        >
          {prestation.active ? <><XCircle size={12} /> Désactiver</> : <><CheckCircle size={12} /> Activer</>}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function PrestationsPage() {
  const [prestations, setPrestations] = useState<Prestation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [editTarget, setEditTarget] = useState<Prestation | null>(null)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(true)

  useEffect(() => {
    getPrestations()
      .then(p => { setPrestations(p); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await savePrestations(prestations)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (p: Prestation | null) => {
    setEditTarget(p ?? blank())
  }

  const handleSaveItem = (updated: Prestation) => {
    setPrestations(prev => {
      const idx = prev.findIndex(p => p.id === updated.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = updated; return next
      }
      return [...prev, updated]
    })
    setEditTarget(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Supprimer cette prestation ?')) return
    setPrestations(prev => prev.filter(p => p.id !== id))
  }

  const handleToggleActive = (id: string) => {
    setPrestations(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p))
  }

  const filtered = prestations.filter(p =>
    (filterCat === 'all' || p.category === filterCat) &&
    (showInactive || p.active)
  )

  const stats = {
    total: prestations.length,
    active: prestations.filter(p => p.active).length,
    ca_min: prestations.filter(p => p.active && p.price_ht).reduce((s, p) => s + (p.price_ht ?? 0), 0),
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prestations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gérez votre catalogue d'offres — synchronisé avec <span className="font-medium">CATALOGUE_OFFRES.md</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(null)}
            className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-accessia-700 transition-colors"
          >
            <Plus size={15} /> Nouvelle prestation
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              saved
                ? 'bg-green-600 text-white'
                : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Sauvegarde…</>
              : saved
              ? <><CheckCircle size={14} /> Enregistré</>
              : <><Save size={14} /> Enregistrer</>
            }
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total prestations', value: stats.total, icon: Package },
          { label: 'Prestations actives', value: stats.active, icon: CheckCircle },
          { label: 'CA potentiel (actives)', value: stats.ca_min > 0 ? `${stats.ca_min.toLocaleString('fr-FR')} €` : '—', icon: Euro },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accessia-50 text-accessia-600 flex items-center justify-center shrink-0">
              <s.icon size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCat === 'all' ? 'bg-accessia-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-accessia-300'}`}
          >
            Toutes
          </button>
          {CATEGORIES.map(c => {
            const style = catStyle(c)
            return (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCat === c ? `${style.bg} ${style.text} border ${style.border}` : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {c}
              </button>
            )
          })}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Afficher les inactifs
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={28} className="animate-spin" />
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Package size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Aucune prestation dans cette catégorie</p>
              <button onClick={() => handleEdit(null)} className="mt-3 text-xs text-accessia-600 hover:underline">
                Ajouter une prestation
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => (
                <PrestationCard
                  key={p.id}
                  prestation={p}
                  onEdit={() => handleEdit(p)}
                  onDelete={() => handleDelete(p.id)}
                  onToggleActive={() => handleToggleActive(p.id)}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 text-center mt-6">
            {filtered.length} prestation{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''} · Cliquez sur <strong>Enregistrer</strong> pour sauvegarder dans CATALOGUE_OFFRES.md
          </p>
        </>
      )}

      {/* Modal */}
      {editTarget && (
        <EditModal
          prestation={editTarget}
          onSave={handleSaveItem}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
