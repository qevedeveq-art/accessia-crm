'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getQuotes, createQuote, updateQuoteStatus, deleteQuote, convertQuoteToInvoice,
  getClients, getPrestations, getQuotePdfUrl,
  Quote, QuoteItem, Client, Prestation,
} from '@/lib/api'
import {
  Plus, FileText, Trash2, Check, ArrowRight, ChevronDown, ChevronUp,
  Search, X, Euro, Clock, Users, Tag, Package, Loader2, AlertCircle,
  Eye, RefreshCw,
} from 'lucide-react'
import { Suspense } from 'react'

// ─── Constantes ───────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  brouillon: 'Brouillon', accepte: 'Accepté', refuse: 'Refusé',
  expire: 'Expiré', convertie: 'Converti en facture',
}
const STATUS_CLS: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-700',
  accepte: 'bg-green-100 text-green-700',
  refuse: 'bg-red-100 text-red-700',
  expire: 'bg-orange-100 text-orange-700',
  convertie: 'bg-blue-100 text-blue-700',
}
const CAT_CLS: Record<string, string> = {
  Diagnostic: 'bg-blue-50 text-blue-700 border-blue-200',
  Intégration: 'bg-violet-50 text-violet-700 border-violet-200',
  Formation: 'bg-amber-50 text-amber-700 border-amber-200',
  Maintenance: 'bg-teal-50 text-teal-700 border-teal-200',
  'Pack PME': 'bg-green-50 text-green-700 border-green-200',
  Autre: 'bg-gray-50 text-gray-700 border-gray-200',
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}
function fmtDate(s?: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('fr-FR') } catch { return s.slice(0, 10) }
}

// ─── QuoteBuilder ─────────────────────────────────────────────
interface BuilderProps {
  clients: Client[]
  prestations: Prestation[]
  prefillClientId?: number
  onClose: () => void
  onCreated: (q: Quote) => void
}

function QuoteBuilder({ clients, prestations, prefillClientId, onClose, onCreated }: BuilderProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [clientId, setClientId] = useState<number | ''>(prefillClientId ?? '')
  const [clientSearch, setClientSearch] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [catFilter, setCatFilter] = useState('')
  const [prestSearch, setPrestSearch] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [tvaRate, setTvaRate] = useState(20)
  const [validDays, setValidDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const selectedClient = clients.find(c => c.id === clientId)
  const amountHt = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const tvaAmt = amountHt * tvaRate / 100
  const amountTtc = amountHt + tvaAmt
  const categories = Array.from(new Set(prestations.map(p => p.category))).sort()

  const filteredPrests = prestations.filter(p => {
    const matchCat = !catFilter || p.category === catFilter
    const q = prestSearch.toLowerCase()
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    return p.active && matchCat && matchQ
  })

  const filteredClients = clients.filter(c => {
    const q = clientSearch.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.contact_name?.toLowerCase().includes(q)
  })

  function addPrestation(p: Prestation) {
    setItems(prev => {
      const exists = prev.findIndex(i => i.name === p.name)
      if (exists >= 0) {
        const next = [...prev]
        next[exists] = { ...next[exists], qty: next[exists].qty + 1 }
        return next
      }
      return [...prev, {
        name: p.name,
        qty: 1,
        unit_price: p.price_ht ?? 0,
        description: p.duration ? `Durée : ${p.duration} · Cible : ${p.target}` : p.target,
      }]
    })
  }

  function updateItem(idx: number, field: keyof QuoteItem, value: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function autoTitle() {
    if (!title && selectedClient && items.length > 0) {
      setTitle(`Devis — ${selectedClient.name} — ${items[0].name}`)
    }
  }

  async function submit() {
    if (!clientId) return setErr('Sélectionnez un client')
    if (items.length === 0) return setErr('Ajoutez au moins une prestation')
    if (!title.trim()) return setErr('Saisissez un titre pour le devis')
    setErr('')
    setSaving(true)
    try {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + validDays)
      const q = await createQuote({
        client_id: clientId as number,
        title: title.trim(),
        items,
        tva_rate: tvaRate,
        valid_until: validUntil.toISOString(),
        notes: notes || undefined,
      })
      onCreated(q)
    } catch (e: any) {
      setErr(e.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Nouveau devis</h2>
            <div className="flex gap-2 mt-1.5">
              {([1, 2, 3] as const).map(s => (
                <button
                  key={s}
                  onClick={() => s < step || (s === 2 && clientId) || (s === 3 && items.length > 0) ? setStep(s) : null}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    step === s ? 'bg-accessia-600 text-white' : step > s ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step > s ? <Check size={10} /> : null}
                  {s === 1 ? '1. Client' : s === 2 ? '2. Prestations' : '3. Finaliser'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {err && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2.5 text-sm mb-4 flex items-center gap-2">
              <AlertCircle size={15} /> {err}
            </div>
          )}

          {/* Étape 1 — Sélection client */}
          {step === 1 && (
            <div>
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  placeholder="Rechercher un client…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-accessia-300 outline-none"
                />
              </div>
              <div className="grid gap-2 max-h-80 overflow-y-auto">
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setClientId(c.id); setClientSearch('') }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      clientId === c.id ? 'border-accessia-500 bg-accessia-50' : 'border-gray-100 hover:border-gray-200 bg-white'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.type.toUpperCase()} · {c.status}{c.contact_email ? ` · ${c.contact_email}` : ''}</p>
                    </div>
                    {clientId === c.id && <Check size={16} className="text-accessia-600 shrink-0" />}
                  </button>
                ))}
              </div>
              {selectedClient && (
                <div className="mt-4 p-4 bg-accessia-50 border border-accessia-200 rounded-xl">
                  <p className="text-sm font-semibold text-accessia-800">{selectedClient.name}</p>
                  <p className="text-xs text-accessia-600 mt-0.5">{selectedClient.contact_name} · {selectedClient.contact_email}</p>
                  {selectedClient.address && <p className="text-xs text-accessia-600">{selectedClient.address}</p>}
                </div>
              )}
            </div>
          )}

          {/* Étape 2 — Sélection prestations */}
          {step === 2 && (
            <div className="flex gap-4 h-[420px]">
              {/* Catalogue */}
              <div className="flex-1 flex flex-col">
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      placeholder="Rechercher…"
                      value={prestSearch}
                      onChange={e => setPrestSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-accessia-300"
                    />
                  </div>
                  <select
                    value={catFilter}
                    onChange={e => setCatFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                  >
                    <option value="">Toutes catégories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPrests.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPrestation(p)}
                      className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-accessia-300 hover:bg-accessia-50 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${CAT_CLS[p.category] ?? CAT_CLS.Autre}`}>{p.category}</span>
                            <span className="text-xs font-semibold text-gray-800 truncate">{p.name}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{p.target}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900">
                            {p.price_ht ? fmt(p.price_ht) : 'Sur devis'}
                            {p.price_max && p.price_max !== p.price_ht ? ` – ${fmt(p.price_max)}` : ''}
                          </p>
                          <p className="text-[10px] text-gray-400">{p.duration}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {p.financing?.map(f => (
                          <span key={f} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-200">{f}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Panier */}
              <div className="w-64 flex flex-col border-l border-gray-100 pl-4">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Lignes du devis</p>
                {items.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-xs text-center">
                    <div>
                      <Package size={28} className="mx-auto mb-2 opacity-30" />
                      Cliquez sur une prestation pour l'ajouter
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-medium text-gray-800 flex-1 line-clamp-2">{item.name}</p>
                          <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 shrink-0 mt-0.5">
                            <X size={12} />
                          </button>
                        </div>
                        <div className="flex gap-1.5 mt-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">Qté</span>
                            <input
                              type="number" min={0.1} step={0.5}
                              value={item.qty}
                              onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                              className="w-12 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-center"
                            />
                          </div>
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[10px] text-gray-400">PU</span>
                            <input
                              type="number" min={0} step={100}
                              value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 text-right"
                            />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-gray-900 text-right mt-1">{fmt(item.qty * item.unit_price)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>Sous-total HT</span><span>{fmt(amountHt)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>TVA {tvaRate}%</span><span>{fmt(tvaAmt)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-gray-900">
                      <span>Total TTC</span><span className="text-accessia-700">{fmt(amountTtc)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Étape 3 — Options */}
          {step === 3 && (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre du devis *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onFocus={autoTitle}
                  placeholder={`Devis — ${selectedClient?.name ?? 'Client'} — ${items[0]?.name ?? 'Prestation'}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Taux TVA (%)</label>
                  <input
                    type="number" min={0} max={100} step={1}
                    value={tvaRate}
                    onChange={e => setTvaRate(parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Validité (jours)</label>
                  <input
                    type="number" min={1} max={365}
                    value={validDays}
                    onChange={e => setValidDays(parseInt(e.target.value) || 30)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes internes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Conditions particulières, contexte, remarques…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
                />
              </div>

              {/* Récapitulatif */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Récapitulatif</p>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Client</span>
                  <span className="font-medium">{selectedClient?.name}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Lignes</span>
                  <span className="font-medium">{items.length} prestation(s)</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Sous-total HT</span>
                  <span className="font-medium">{fmt(amountHt)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">TVA {tvaRate}%</span>
                  <span className="font-medium">{fmt(tvaAmt)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-accessia-700 border-t border-gray-200 pt-2">
                  <span>Total TTC</span>
                  <span>{fmt(amountTtc)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(s => (s - 1) as any)}
                className="text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                ← Retour
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => {
                  if (step === 1 && !clientId) return setErr('Sélectionnez un client')
                  if (step === 2 && items.length === 0) return setErr('Ajoutez au moins une prestation')
                  setErr('')
                  setStep(s => (s + 1) as any)
                  if (step === 2) autoTitle()
                }}
                className="text-sm bg-accessia-600 text-white px-5 py-2 rounded-lg hover:bg-accessia-700 font-medium flex items-center gap-2"
              >
                Suivant <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={saving}
                className="text-sm bg-accessia-600 text-white px-5 py-2 rounded-lg hover:bg-accessia-700 font-medium flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Créer le devis
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Ligne devis ──────────────────────────────────────────────
function QuoteRow({ quote, onStatusChange, onDelete, onConvert, onPdf }: {
  quote: Quote
  onStatusChange: (id: number, s: string) => void
  onDelete: (id: number) => void
  onConvert: (id: number) => void
  onPdf: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow">
      <div className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{quote.number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[quote.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[quote.status] ?? quote.status}
            </span>
          </div>
          <p className="font-semibold text-gray-900 mt-0.5 truncate">{quote.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {quote.client_name}
            {quote.valid_until ? ` · Valide jusqu'au ${fmtDate(quote.valid_until)}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-gray-900">{fmt(quote.amount_ttc)}</p>
          <p className="text-xs text-gray-400">TTC ({fmt(quote.amount_ht)} HT)</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            title="Voir PDF / Imprimer"
            onClick={() => onPdf(quote.id)}
            className="p-2 text-gray-400 hover:text-accessia-600 rounded-lg hover:bg-accessia-50"
          >
            <Eye size={15} />
          </button>
          {quote.status === 'brouillon' && (
            <>
              <button
                title="Marquer comme accepté"
                onClick={() => onStatusChange(quote.id, 'accepte')}
                className="p-2 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
              >
                <Check size={15} />
              </button>
              <button
                title="Convertir en facture"
                onClick={() => onConvert(quote.id)}
                className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
              >
                <ArrowRight size={15} />
              </button>
            </>
          )}
          <button
            title="Supprimer"
            onClick={() => { if (confirm('Supprimer ce devis ?')) onDelete(quote.id) }}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={14} />
          </button>
          {quote.items && quote.items.length > 0 && (
            <button onClick={() => setExpanded(e => !e)} className="p-2 text-gray-400 hover:text-gray-600">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {expanded && quote.items && quote.items.length > 0 && (
        <div className="border-t border-gray-50 px-4 pb-3">
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left pb-1.5 font-medium">Prestation</th>
                <th className="text-center pb-1.5 font-medium w-12">Qté</th>
                <th className="text-right pb-1.5 font-medium w-24">PU HT</th>
                <th className="text-right pb-1.5 font-medium w-24">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5">
                    <span className="font-medium text-gray-800">{it.name}</span>
                    {it.description && <span className="text-gray-400 ml-2">{it.description}</span>}
                  </td>
                  <td className="text-center py-1.5 text-gray-600">{it.qty}</td>
                  <td className="text-right py-1.5 text-gray-600">{fmt(it.unit_price)}</td>
                  <td className="text-right py-1.5 font-semibold text-gray-800">{fmt(it.qty * it.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────
function DevisPageInner() {
  const searchParams = useSearchParams()
  const prefillClientId = searchParams.get('client_id') ? parseInt(searchParams.get('client_id')!) : undefined

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [prestations, setPrestations] = useState<Prestation[]>([])
  const [loading, setLoading] = useState(true)
  const [builderOpen, setBuilderOpen] = useState(!!prefillClientId)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [q, c, p] = await Promise.all([getQuotes(), getClients(), getPrestations()])
      setQuotes(q)
      setClients(c)
      setPrestations(p)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = quotes.filter(q => {
    const matchStatus = !filterStatus || q.status === filterStatus
    const matchSearch = !search || q.title.toLowerCase().includes(search.toLowerCase()) || q.client_name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const brouillons = quotes.filter(q => q.status === 'brouillon').length
  const acceptes = quotes.filter(q => q.status === 'accepte').length
  const totalHt = quotes.filter(q => q.status !== 'refuse').reduce((s, q) => s + q.amount_ht, 0)

  async function handleStatusChange(id: number, status: string) {
    await updateQuoteStatus(id, status)
    await load()
  }
  async function handleDelete(id: number) {
    await deleteQuote(id)
    setQuotes(prev => prev.filter(q => q.id !== id))
  }
  async function handleConvert(id: number) {
    if (!confirm('Convertir ce devis en facture ?')) return
    await convertQuoteToInvoice(id)
    await load()
  }
  function handlePdf(id: number) {
    window.open(getQuotePdfUrl(id), '_blank')
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Devis</h1>
          <p className="text-sm text-gray-500 mt-0.5">{quotes.length} devis · {fmt(totalHt)} HT en cours</p>
        </div>
        <button
          onClick={() => setBuilderOpen(true)}
          className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accessia-700"
        >
          <Plus size={16} /> Nouveau devis
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-gray-500" />
          </div>
          <div><p className="text-2xl font-bold text-gray-900">{brouillons}</p><p className="text-xs text-gray-500">En attente</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <Check size={18} className="text-green-600" />
          </div>
          <div><p className="text-2xl font-bold text-gray-900">{acceptes}</p><p className="text-xs text-gray-500">Acceptés</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accessia-100 flex items-center justify-center shrink-0">
            <Euro size={18} className="text-accessia-600" />
          </div>
          <div><p className="text-xl font-bold text-gray-900">{fmt(totalHt)}</p><p className="text-xs text-gray-500">CA potentiel HT</p></div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-accessia-300 outline-none"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-accessia-300 outline-none">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <AlertCircle size={15} />{error}
          <button onClick={() => { setError(''); load() }} className="ml-auto underline text-xs">Réessayer</button>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={28} className="animate-spin mr-2" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p>{quotes.length === 0 ? 'Aucun devis. Créez votre premier devis.' : 'Aucun résultat.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <QuoteRow
              key={q.id}
              quote={q}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onConvert={handleConvert}
              onPdf={handlePdf}
            />
          ))}
        </div>
      )}

      {/* Builder */}
      {builderOpen && (
        <QuoteBuilder
          clients={clients}
          prestations={prestations}
          prefillClientId={prefillClientId}
          onClose={() => setBuilderOpen(false)}
          onCreated={async (q) => {
            setBuilderOpen(false)
            await load()
            window.open(getQuotePdfUrl(q.id), '_blank')
          }}
        />
      )}
    </div>
  )
}

export default function DevisPage() {
  return <Suspense fallback={<div className="p-6 text-gray-400">Chargement…</div>}><DevisPageInner /></Suspense>
}
