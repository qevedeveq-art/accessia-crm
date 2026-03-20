'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getClients, createClient, searchCompany, Client, ClientCreate, CompanySearchResult } from '@/lib/api'
import Link from 'next/link'
import { Plus, Search, Building2, Mail, Phone, Loader2, Wand2, MapPin } from 'lucide-react'

const STATUS_OPTS = ['prospect', 'active', 'inactive']
const TYPE_OPTS   = ['micro', 'pme', 'eti', 'grand_compte']
const SOURCE_OPTS = ['LinkedIn', 'Référence', 'Site web', 'Réseau', 'BPI France', 'Salon', 'Autre']
const BUDGET_OPTS = ['< 5K€', '5K–15K€', '15K–50K€', '50K–150K€', '> 150K€']
const SECTOR_OPTS = [
  'Commerce / Distribution', 'BTP / Immobilier', 'Santé / Médical', 'Industrie / Fabrication',
  'Services B2B', 'Restauration / Hôtellerie', 'Agriculture / Agroalimentaire',
  'Transport / Logistique', 'Finance / Assurance', 'Éducation / Formation', 'Autre',
]

function nafToSector(nafCode: string): string {
  const p = parseInt(nafCode.slice(0, 2), 10)
  if ([47, 46, 45].includes(p))                             return 'Commerce / Distribution'
  if ([41, 42, 43, 68].includes(p))                         return 'BTP / Immobilier'
  if ([86, 87, 88].includes(p))                             return 'Santé / Médical'
  if (p >= 10 && p <= 33)                                   return 'Industrie / Fabrication'
  if ([55, 56].includes(p))                                 return 'Restauration / Hôtellerie'
  if ([1, 2, 3].includes(p))                                return 'Agriculture / Agroalimentaire'
  if ([49, 50, 51, 52, 53].includes(p))                     return 'Transport / Logistique'
  if ([64, 65, 66].includes(p))                             return 'Finance / Assurance'
  if ([85].includes(p))                                     return 'Éducation / Formation'
  if ([62, 63, 69, 70, 71, 72, 73, 74, 78, 80, 82].includes(p)) return 'Services B2B'
  return 'Autre'
}

function Badge({ v }: { v: string }) {
  const cls: Record<string, string> = {
    prospect: 'badge-prospect', active: 'badge-active', inactive: 'badge-inactive',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[v] ?? 'bg-gray-100 text-gray-600'}`}>{v}</span>
}

const EMPTY: ClientCreate = {
  name: '', type: 'pme', sector: '', contact_name: '', contact_email: '',
  contact_phone: '', address: '', website: '', siret: '', status: 'prospect',
  source: '', budget_range: '', notes: '',
}

function ClientsContent() {
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ClientCreate>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [siretSearching, setSiretSearching] = useState(false)
  const [nameSuggestions, setNameSuggestions] = useState<CompanySearchResult[]>([])
  const [nameSearching, setNameSearching] = useState(false)
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const [siretCandidates, setSiretCandidates] = useState<CompanySearchResult[]>([])
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const load = () =>
    getClients({ search: search || undefined, status: filter || undefined })
      .then(setClients)
      .catch(e => setError(e.message))

  useEffect(() => { load() }, [search, filter])

  // Pré-remplissage depuis la page Prospection IA
  useEffect(() => {
    const prefill = searchParams.get('prefill')
    if (prefill) {
      try {
        const data = JSON.parse(prefill) as Partial<ClientCreate>
        setForm(f => ({ ...f, ...data }))
        setOpen(true)
      } catch { /* ignore */ }
    }
  }, [searchParams])

  const typeMap: Record<string, string> = { GE: 'grand_compte', ETI: 'eti', PME: 'pme', TPE: 'micro' }

  const applyCompany = (c: CompanySearchResult) => {
    const fullAddress = [c.address, c.postal_code, c.city].filter(Boolean).join(' ')
    setForm(f => ({
      ...f,
      name: c.name,
      siret: c.siret_siege || f.siret,
      address: fullAddress || f.address,
      type: typeMap[c.categorie] || f.type || 'pme',
      sector: nafToSector(c.naf_code) || f.sector,
      source: f.source || 'BPI France',
    }))
    setShowNameDropdown(false)
    setNameSuggestions([])
    setSiretCandidates([])
    setDropdownRect(null)
  }

  const fillFromSiret = async () => {
    if (!form.siret || form.siret.replace(/\s/g, '').length < 9) return
    setSiretSearching(true)
    setSiretCandidates([])
    try {
      const data = await searchCompany(form.siret.replace(/\s/g, ''))
      if (data.results.length === 1) {
        applyCompany(data.results[0])
      } else if (data.results.length > 1) {
        setSiretCandidates(data.results)
      }
    } catch { /* silently ignore */ }
    setSiretSearching(false)
  }

  const openDropdown = () => {
    if (nameInputRef.current) {
      const r = nameInputRef.current.getBoundingClientRect()
      setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
  }

  const handleNameChange = (v: string) => {
    set('name', v)
    setShowNameDropdown(false)
    if (nameDebounce.current) clearTimeout(nameDebounce.current)
    if (v.trim().length < 2) { setNameSuggestions([]); setDropdownRect(null); return }
    nameDebounce.current = setTimeout(async () => {
      setNameSearching(true)
      try {
        const data = await searchCompany(v.trim())
        setNameSuggestions(data.results.slice(0, 8))
        if (data.results.length > 0) {
          openDropdown()
          setShowNameDropdown(true)
        }
      } catch { setNameSuggestions([]) }
      setNameSearching(false)
    }, 400)
  }

  const set = (k: keyof ClientCreate, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { setError('Le nom du client est requis'); return }
    setSaving(true)
    setError('')
    try {
      await createClient(form)
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} client(s)</p>
        </div>
        <button
          onClick={() => { setOpen(true); setError('') }}
          className="flex items-center gap-2 bg-accessia-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accessia-700 transition-colors"
        >
          <Plus size={16} /> Nouveau client
        </button>
      </div>

      {/* Erreur API */}
      {error && !open && (
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <span>Impossible de joindre l'API : {error}</span>
          <button onClick={() => { setError(''); load() }} className="ml-auto text-xs underline hover:text-red-900">Réessayer</button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-accessia-300 outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-accessia-300 outline-none"
        >
          <option value="">Tous les statuts</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Liste */}
      <div className="grid gap-3">
        {clients.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-40" />
            <p>Aucun client trouvé.</p>
          </div>
        )}
        {clients.map(c => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-sm">
                {c.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.type.toUpperCase()} {c.sector ? `· ${c.sector}` : ''}
                  {c.contact_name ? ` · ${c.contact_name}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end gap-1">
                {c.contact_email && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Mail size={11} /> {c.contact_email}
                  </span>
                )}
                {c.contact_phone && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Phone size={11} /> {c.contact_phone}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge v={c.status} />
                <span className="text-xs text-gray-400">{c.projects_count} projet(s)</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Modal Nouveau Client */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nouveau client</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Le dossier client sera créé automatiquement dans <code className="text-xs bg-gray-100 px-1 rounded">01_COMMERCIAL/Clients/</code>
              </p>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de la société *
                    {nameSearching && <Loader2 size={11} className="inline ml-2 animate-spin text-gray-400" />}
                  </label>
                  <input
                    ref={nameInputRef}
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    onBlur={() => setTimeout(() => { setShowNameDropdown(false); setDropdownRect(null) }, 200)}
                    onFocus={() => { if (nameSuggestions.length > 0) { openDropdown(); setShowNameDropdown(true) } }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="Tapez un nom ou SIREN pour rechercher…"
                    autoComplete="off"
                  />
                </div>
                {/* Dropdown rendu en position fixed pour échapper au overflow du modal */}
                {showNameDropdown && nameSuggestions.length > 0 && dropdownRect && (
                  <div
                    className="col-span-2"
                    style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, zIndex: 9999 }}
                  >
                    <div className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-[11px] text-gray-400 font-medium">{nameSuggestions.length} résultat(s) — registre officiel</span>
                        <span className="text-[11px] text-gray-400">Cliquez pour remplir le formulaire</span>
                      </div>
                      {nameSuggestions.map(c => (
                        <button
                          key={c.siren}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); applyCompany(c) }}
                          className="w-full px-4 py-2.5 text-left hover:bg-accessia-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-gray-900 truncate">{c.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.status === 'actif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{c.status}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{c.categorie}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {c.city && <span className="text-xs text-gray-500 flex items-center gap-0.5"><MapPin size={10} />{c.postal_code} {c.city}</span>}
                            <span className="text-xs text-gray-400">{c.naf_label}</span>
                            {c.effectif_label && c.effectif_label !== 'Non employeuse' && <span className="text-xs text-gray-400">{c.effectif_label}</span>}
                          </div>
                          <div className="mt-0.5">
                            <span className="text-[10px] font-mono text-gray-300">SIREN {c.siren}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    {TYPE_OPTS.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secteur</label>
                  <select value={form.sector} onChange={e => set('sector', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    <option value="">— Sélectionner —</option>
                    {SECTOR_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <select value={form.source} onChange={e => set('source', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    <option value="">— Sélectionner —</option>
                    {SOURCE_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact principal</label>
                  <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="Prénom Nom" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="contact@société.fr" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="06 00 00 00 00" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Budget estimé</label>
                  <select value={form.budget_range} onChange={e => set('budget_range', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none">
                    <option value="">— Sélectionner —</option>
                    {BUDGET_OPTS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SIREN / SIRET</label>
                  <div className="flex gap-2">
                    <input value={form.siret} onChange={e => set('siret', e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                      placeholder="123 456 789 00012" />
                    <button
                      type="button"
                      onClick={fillFromSiret}
                      disabled={siretSearching || !form.siret || form.siret.replace(/\s/g, '').length < 9}
                      title="Rechercher et remplir automatiquement depuis le registre"
                      className="flex items-center gap-1.5 px-3 py-2 bg-accessia-50 text-accessia-700 border border-accessia-200 rounded-lg text-xs font-medium hover:bg-accessia-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {siretSearching ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      Auto-fill
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Entrez un SIREN ou SIRET puis cliquez Auto-fill pour récupérer les données officielles</p>
                  {siretCandidates.length > 1 && (
                    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                      <p className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-200">
                        {siretCandidates.length} résultats — choisissez un établissement :
                      </p>
                      {siretCandidates.map(c => (
                        <button
                          key={c.siren}
                          type="button"
                          onClick={() => applyCompany(c)}
                          className="w-full px-3 py-2 text-left hover:bg-accessia-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-gray-900 truncate">{c.name}</span>
                            <span className="text-xs font-mono text-gray-400 shrink-0">{c.siret_siege}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-400">{c.naf_label}</span>
                            {c.city && <span className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin size={10} />{c.city}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site web</label>
                  <input value={form.website} onChange={e => set('website', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="https://…" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                  <input value={form.address} onChange={e => set('address', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none"
                    placeholder="123 rue de la Paix, 75001 Paris" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accessia-300 outline-none resize-none"
                    placeholder="Contexte, besoins identifiés…" />
                </div>

              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setOpen(false); setError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Annuler
              </button>
              <button onClick={submit} disabled={saving}
                className="px-5 py-2 bg-accessia-600 text-white rounded-lg text-sm font-medium hover:bg-accessia-700 transition-colors disabled:opacity-60">
                {saving ? 'Création…' : 'Créer le client + dossier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsContent />
    </Suspense>
  )
}
