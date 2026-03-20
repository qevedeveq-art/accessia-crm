'use client'

import { useEffect, useState } from 'react'
import {
  getInvoices, createInvoice, updateInvoiceStatus,
  getQuotes, createQuote, updateQuoteStatus, convertQuoteToInvoice, deleteQuote,
  getClients, Invoice, Client, InvoiceCreate, Quote, QuoteCreate,
} from '@/lib/api'
import { Plus, TrendingUp, Clock, CheckCircle, FileText, ArrowRight, Trash2 } from 'lucide-react'

const STATUS_INVOICE = ['brouillon', 'envoyee', 'payee', 'annulee']
const STATUS_QUOTE   = ['brouillon', 'envoye', 'accepte', 'refuse', 'expire']

function Badge({ v }: { v: string }) {
  const cls: Record<string, string> = {
    brouillon: 'badge-brouillon', envoyee: 'badge-envoyee', payee: 'badge-payee',
    annulee: 'badge-annule', envoye: 'badge-envoyee', accepte: 'badge-payee',
    refuse: 'badge-annule', expire: 'bg-gray-100 text-gray-500 border border-gray-200',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[v] ?? 'bg-gray-100 text-gray-600'}`}>{v}</span>
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const EMPTY_INV: InvoiceCreate = { client_id: 0, amount_ht: 0, tva_rate: 20, status: 'brouillon' }
const EMPTY_QUOTE: QuoteCreate = { client_id: 0, title: '', amount_ht: 0, tva_rate: 20, status: 'brouillon' }

export default function FinancesPage() {
  const [tab, setTab] = useState<'factures' | 'devis'>('factures')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [openInv, setOpenInv] = useState(false)
  const [openQuote, setOpenQuote] = useState(false)
  const [formInv, setFormInv] = useState<InvoiceCreate>(EMPTY_INV)
  const [formQuote, setFormQuote] = useState<QuoteCreate>(EMPTY_QUOTE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadAll = () => {
    getInvoices().then(setInvoices).catch(e => setError(e.message))
    getQuotes().then(setQuotes).catch(() => {})
    getClients().then(setClients).catch(() => {})
  }
  useEffect(() => { loadAll() }, [])

  const setInv = (k: keyof InvoiceCreate, v: string | number) => setFormInv(f => ({ ...f, [k]: v }))
  const setQt  = (k: keyof QuoteCreate, v: string | number)   => setFormQuote(f => ({ ...f, [k]: v }))

  const submitInvoice = async () => {
    if (!formInv.client_id) { setError('Sélectionner un client'); return }
    if (!formInv.amount_ht)  { setError('Montant requis'); return }
    setSaving(true); setError('')
    try {
      await createInvoice(formInv)
      setOpenInv(false); setFormInv(EMPTY_INV); loadAll()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const submitQuote = async () => {
    if (!formQuote.client_id) { setError('Sélectionner un client'); return }
    if (!formQuote.title.trim()) { setError('Titre requis'); return }
    if (!formQuote.amount_ht)    { setError('Montant requis'); return }
    setSaving(true); setError('')
    try {
      await createQuote(formQuote)
      setOpenQuote(false); setFormQuote(EMPTY_QUOTE); loadAll()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const changeInvoiceStatus = async (id: number, s: string) => {
    await updateInvoiceStatus(id, s).catch(e => setError(e.message))
    loadAll()
  }

  const changeQuoteStatus = async (id: number, s: string) => {
    await updateQuoteStatus(id, s).catch(e => setError(e.message))
    loadAll()
  }

  const handleConvert = async (id: number) => {
    if (!confirm('Convertir ce devis en facture ?')) return
    try {
      await convertQuoteToInvoice(id)
      loadAll()
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteQuote = async (id: number) => {
    if (!confirm('Supprimer ce devis ?')) return
    await deleteQuote(id).catch(e => setError(e.message))
    loadAll()
  }

  const caTotal    = invoices.filter(i => i.status === 'payee').reduce((s, i) => s + i.amount_ht, 0)
  const caPending  = invoices.filter(i => i.status === 'envoyee').reduce((s, i) => s + i.amount_ht, 0)
  const caTotal_ttc = invoices.filter(i => i.status === 'payee').reduce((s, i) => s + i.amount_ttc, 0)

  const quotesPending  = quotes.filter(q => ['brouillon', 'envoye'].includes(q.status))
  const quotesAccepted = quotes.filter(q => q.status === 'accepte')
  const acceptRate     = quotes.length > 0 ? Math.round((quotesAccepted.length / quotes.length) * 100) : 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finances</h1>
          <p className="text-sm text-gray-500 mt-0.5">Facturation & trésorerie</p>
        </div>
        {tab === 'factures' ? (
          <button onClick={() => { setOpenInv(true); setError('') }}
            className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accessia-700 transition-colors">
            <Plus size={16} /> Nouvelle facture
          </button>
        ) : (
          <button onClick={() => { setOpenQuote(true); setError('') }}
            className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accessia-700 transition-colors">
            <Plus size={16} /> Nouveau devis
          </button>
        )}
      </div>

      {error && !openInv && !openQuote && (
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-xs underline">Fermer</button>
        </div>
      )}

      {/* Onglets */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {([['factures', 'Factures'], ['devis', 'Devis']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-accessia-600 text-accessia-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'factures' && (
        <>
          {/* KPIs factures */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'CA encaissé HT', value: fmt(caTotal), sub: `${fmt(caTotal_ttc)} TTC`, icon: CheckCircle, color: 'bg-emerald-500' },
              { label: 'En attente', value: fmt(caPending), sub: `${invoices.filter(i => i.status === 'envoyee').length} facture(s)`, icon: Clock, color: 'bg-amber-500' },
              { label: 'Total facturé', value: fmt(caTotal + caPending), sub: `${invoices.length} facture(s)`, icon: TrendingUp, color: 'bg-accessia-500' },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon size={20} className="text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Table factures */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Numéro', 'Client', 'Montant HT', 'TTC', 'Statut', 'Échéance', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucune facture</td></tr>
                )}
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-accessia-600">{inv.number}</td>
                    <td className="px-4 py-3 font-medium">{inv.client_name}</td>
                    <td className="px-4 py-3">{fmt(inv.amount_ht)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmt(inv.amount_ttc)}</td>
                    <td className="px-4 py-3"><Badge v={inv.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="px-4 py-3">
                      <select value={inv.status} onChange={e => changeInvoiceStatus(inv.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-accessia-300 outline-none">
                        {STATUS_INVOICE.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'devis' && (
        <>
          {/* KPIs devis */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Devis en cours', value: fmt(quotesPending.reduce((s, q) => s + q.amount_ht, 0)), sub: `${quotesPending.length} devis`, icon: FileText, color: 'bg-accessia-500' },
              { label: 'Taux d\'acceptation', value: `${acceptRate}%`, sub: `${quotesAccepted.length} accepté(s) sur ${quotes.length}`, icon: CheckCircle, color: 'bg-emerald-500' },
              { label: 'Pipeline devis', value: fmt(quotes.reduce((s, q) => s + q.amount_ht, 0)), sub: `${quotes.length} devis total`, icon: TrendingUp, color: 'bg-amber-500' },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon size={20} className="text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Table devis */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Numéro', 'Titre', 'Client', 'Montant HT', 'TTC', 'Statut', 'Validité', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">Aucun devis</td></tr>
                )}
                {quotes.map(q => (
                  <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-accessia-600">{q.number}</td>
                    <td className="px-4 py-3 font-medium max-w-[180px] truncate">{q.title}</td>
                    <td className="px-4 py-3 text-gray-600">{q.client_name}</td>
                    <td className="px-4 py-3">{fmt(q.amount_ht)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmt(q.amount_ttc)}</td>
                    <td className="px-4 py-3"><Badge v={q.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{q.valid_until ? new Date(q.valid_until).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select value={q.status} onChange={e => changeQuoteStatus(q.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-accessia-300 outline-none">
                          {STATUS_QUOTE.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {q.status === 'accepte' && (
                          <button title="Convertir en facture" onClick={() => handleConvert(q.id)}
                            className="text-emerald-600 hover:text-emerald-800 p-1 rounded hover:bg-emerald-50">
                            <ArrowRight size={14} />
                          </button>
                        )}
                        <button title="Supprimer" onClick={() => handleDeleteQuote(q.id)}
                          className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal nouvelle facture */}
      {openInv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold">Nouvelle facture</h2>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="label">Client *</label>
                <select value={formInv.client_id} onChange={e => setInv('client_id', Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                  <option value={0}>— Sélectionner —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Montant HT (€) *</label>
                  <input type="number" value={formInv.amount_ht || ''} onChange={e => setInv('amount_ht', Number(e.target.value))}
                    className="input w-full" placeholder="0" />
                </div>
                <div>
                  <label className="label">TVA (%)</label>
                  <input type="number" value={formInv.tva_rate ?? 20} onChange={e => setInv('tva_rate', Number(e.target.value))}
                    className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Date d'échéance</label>
                <input type="date" value={formInv.due_date?.slice(0, 10) ?? ''} onChange={e => setInv('due_date', e.target.value)}
                  className="input w-full" />
              </div>
              {formInv.amount_ht > 0 && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
                  Total TTC : <strong className="text-gray-900">{fmt(formInv.amount_ht * (1 + (formInv.tva_rate ?? 20) / 100))}</strong>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setOpenInv(false)} className="btn-secondary">Annuler</button>
              <button onClick={submitInvoice} disabled={saving} className="btn-primary">
                {saving ? 'Création…' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nouveau devis */}
      {openQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold">Nouveau devis</h2>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="label">Client *</label>
                <select value={formQuote.client_id} onChange={e => setQt('client_id', Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                  <option value={0}>— Sélectionner —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Titre *</label>
                <input type="text" value={formQuote.title} onChange={e => setQt('title', e.target.value)}
                  className="input w-full" placeholder="Ex: Accompagnement IA — Phase 1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Montant HT (€) *</label>
                  <input type="number" value={formQuote.amount_ht || ''} onChange={e => setQt('amount_ht', Number(e.target.value))}
                    className="input w-full" placeholder="0" />
                </div>
                <div>
                  <label className="label">TVA (%)</label>
                  <input type="number" value={formQuote.tva_rate ?? 20} onChange={e => setQt('tva_rate', Number(e.target.value))}
                    className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Valide jusqu'au</label>
                <input type="date" value={formQuote.valid_until?.slice(0, 10) ?? ''} onChange={e => setQt('valid_until', e.target.value)}
                  className="input w-full" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={formQuote.description ?? ''} onChange={e => setQt('description', e.target.value)}
                  className="input w-full h-20 resize-none" placeholder="Scope de la prestation…" />
              </div>
              {(formQuote.amount_ht ?? 0) > 0 && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
                  Total TTC : <strong className="text-gray-900">{fmt((formQuote.amount_ht ?? 0) * (1 + (formQuote.tva_rate ?? 20) / 100))}</strong>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setOpenQuote(false)} className="btn-secondary">Annuler</button>
              <button onClick={submitQuote} disabled={saving} className="btn-primary">
                {saving ? 'Création…' : 'Créer le devis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
