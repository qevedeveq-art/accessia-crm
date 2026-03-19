'use client'

import { useState, useRef, useEffect } from 'react'
import { searchCompany, CompanySearchResult, GrantInfo, ClientCreate } from '@/lib/api'
import { Search, Building2, MapPin, Users, Calendar, CheckCircle2, XCircle, AlertCircle, ExternalLink, ChevronDown, ChevronUp, ChevronRight, Plus, Loader2, Euro, Clock, Stethoscope, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const HISTORY_KEY = 'accessia_search_history'
const MAX_HISTORY = 6

function getHistory(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function addToHistory(q: string) {
  const h = getHistory().filter(x => x !== q)
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...h].slice(0, MAX_HISTORY)))
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-FR') } catch { return d }
}

function totalEligible(grants: GrantInfo[]) {
  return grants.filter(g => g.eligible).length
}

function totalEstimated(grants: GrantInfo[]) {
  return grants.filter(g => g.eligible).reduce((s, g) => s + (g.amount_max || 0), 0)
}

// Grants with % coverage (no fixed amount_max) but still show as eligible
function hasPercentGrants(grants: GrantInfo[]) {
  return grants.filter(g => g.eligible && g.amount_max === 0).length > 0
}

// ─── Grant Card ───────────────────────────────────────────────

function GrantCard({ grant }: { grant: GrantInfo }) {
  const [expanded, setExpanded] = useState(false)

  const icon = grant.eligible
    ? <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
    : <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />

  const confidenceBadge = {
    high: <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Éligible</span>,
    medium: <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">À vérifier</span>,
    low: <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Peu éligible</span>,
  }[grant.eligible ? grant.confidence : 'low']

  return (
    <div className={`rounded-xl border p-4 transition-colors ${grant.eligible ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
      <div className="flex items-start gap-2">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 leading-snug">{grant.name}</p>
            {confidenceBadge}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{grant.description}</p>

          {grant.eligible && (
            <p className="text-sm font-semibold text-accessia-700 mt-1.5">{grant.amount_label}</p>
          )}

          {grant.deadline && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={11} /> {grant.deadline}
            </p>
          )}

          {/* Détails dépliables */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-2 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Masquer les conditions' : 'Voir les conditions'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5">
              {grant.conditions_ok.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-green-700">
                  <CheckCircle2 size={11} className="shrink-0 mt-0.5" /> {c}
                </div>
              ))}
              {grant.conditions_missing.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertCircle size={11} className="shrink-0 mt-0.5" /> {c}
                </div>
              ))}
              <a
                href={grant.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accessia-600 hover:underline mt-1"
              >
                Plus d'infos <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Company Card ─────────────────────────────────────────────

function CompanyCard({
  company,
  onImport,
}: {
  company: CompanySearchResult
  onImport: (c: CompanySearchResult) => void
}) {
  const eligible = totalEligible(company.grants)
  const estimated = totalEstimated(company.grants)

  return (
    <div className="grid md:grid-cols-2 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {/* Colonne gauche — infos entreprise */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-accessia-100 text-accessia-700 flex items-center justify-center font-bold text-lg shrink-0">
            {company.name[0]}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-snug">{company.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">SIREN : {company.siren}</p>
            <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded ${company.status === 'actif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {company.status === 'actif' ? '● Actif' : '● Cessé'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5">Secteur (NAF)</p>
            <p className="font-medium text-gray-800">{company.naf_label}</p>
            <p className="text-gray-400">{company.naf_code}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5 flex items-center gap-1"><Users size={10} /> Effectif</p>
            <p className="font-medium text-gray-800">{company.effectif_label}</p>
            <p className="text-gray-400">{company.categorie}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5 flex items-center gap-1"><MapPin size={10} /> Localisation</p>
            <p className="font-medium text-gray-800">{company.city || company.postal_code}</p>
            <p className="text-gray-400">{company.region}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-gray-400 mb-0.5 flex items-center gap-1"><Calendar size={10} /> Création</p>
            <p className="font-medium text-gray-800">{formatDate(company.date_creation)}</p>
            <p className="text-gray-400">SIRET : {company.siret_siege.slice(-5)}</p>
          </div>
        </div>

        {company.address && (
          <p className="text-xs text-gray-400 flex items-start gap-1">
            <MapPin size={11} className="shrink-0 mt-0.5" />
            {company.address}{company.postal_code ? ` — ${company.postal_code} ${company.city}` : ''}
          </p>
        )}

        {/* Résumé aides */}
        <div className="bg-accessia-50 border border-accessia-100 rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-accessia-500">Aides IA éligibles</p>
              <p className="text-lg font-bold text-accessia-700">{eligible} / {company.grants.length}</p>
            </div>
            <div className="text-right">
              {estimated > 0 ? (
                <>
                  <p className="text-xs text-accessia-500">Économies directes min.</p>
                  <p className="text-lg font-bold text-accessia-700 flex items-center gap-0.5 justify-end">
                    <Euro size={14} />
                    {estimated.toLocaleString('fr-FR')}
                  </p>
                </>
              ) : eligible > 0 && (
                <>
                  <p className="text-xs text-accessia-500">Financement %</p>
                  <p className="text-sm font-bold text-accessia-700 flex items-center gap-1 justify-end">
                    <TrendingUp size={13} /> Jusqu'à 80%
                  </p>
                </>
              )}
            </div>
          </div>
          {hasPercentGrants(company.grants) && (
            <p className="text-[10px] text-accessia-400 mt-1.5 flex items-center gap-1">
              <AlertCircle size={9} /> + aides en % du projet (IA Booster, CIR, régional) non incluses dans le montant
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onImport(company)}
            className="flex-1 flex items-center justify-center gap-2 bg-accessia-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-700 transition-colors"
          >
            <Plus size={15} /> Créer comme client
          </button>
          <Link
            href={`/diagnostics?new=ia&company=${encodeURIComponent(company.name)}`}
            className="flex items-center justify-center gap-1.5 border border-accessia-300 text-accessia-700 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-50 transition-colors shrink-0"
            title="Lancer un diagnostic IA"
          >
            <Stethoscope size={15} /> Diagnostiquer
          </Link>
        </div>
      </div>

      {/* Colonne droite — aides */}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aides & Financements IA</p>
        {company.grants.map(g => (
          <GrantCard key={g.id} grant={g} />
        ))}
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────

function ImportModal({
  company,
  onClose,
}: {
  company: CompanySearchResult
  onClose: () => void
}) {
  const router = useRouter()

  const handleGo = () => {
    // Encode les données dans l'URL pour pré-remplir la modal client
    const params = new URLSearchParams({
      prefill: JSON.stringify({
        name: company.name,
        siret: company.siret_siege,
        address: company.address ? `${company.address}${company.postal_code ? ` ${company.postal_code} ${company.city}` : ''}` : '',
        type: company.categorie === 'GE' ? 'grand_compte' : company.categorie === 'ETI' ? 'eti' : company.categorie === 'PME' ? 'pme' : 'micro',
        status: 'prospect',
        source: 'BPI France',
      } as Partial<ClientCreate>),
    })
    router.push(`/clients?${params.toString()}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Créer ce client ?</h3>
        <p className="text-sm text-gray-500 mb-4">
          Les informations officielles de <strong>{company.name}</strong> seront pré-remplies dans la fiche client.
        </p>

        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-gray-400">Nom</span><span className="font-medium">{company.name}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">SIRET</span><span className="font-mono text-xs">{company.siret_siege}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Secteur</span><span>{company.naf_label}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Catégorie</span><span>{company.categorie}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Région</span><span>{company.region}</span></div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleGo} className="flex-1 bg-accessia-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-accessia-700 transition-colors">
            Aller vers les clients
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pick list (plusieurs résultats) ──────────────────────────

function ResultPickList({
  results,
  total,
  selected,
  onSelect,
}: {
  results: CompanySearchResult[]
  total: number
  selected: CompanySearchResult | null
  onSelect: (c: CompanySearchResult) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">
          {results.length} résultat{results.length > 1 ? 's' : ''}
          {total > results.length && <span className="font-normal text-gray-400"> sur {total.toLocaleString('fr-FR')}</span>}
        </p>
        <p className="text-xs text-gray-400">Sélectionnez une entreprise pour voir ses aides IA</p>
      </div>
      <div className="divide-y divide-gray-50">
        {results.map(c => {
          const isSelected = selected?.siren === c.siren
          const eligible = totalEligible(c.grants)
          return (
            <button
              key={c.siren}
              onClick={() => onSelect(c)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors ${
                isSelected
                  ? 'bg-accessia-50 border-l-4 border-l-accessia-500'
                  : 'hover:bg-gray-50 border-l-4 border-l-transparent'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${isSelected ? 'bg-accessia-600 text-white' : 'bg-accessia-100 text-accessia-700'}`}>
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${isSelected ? 'text-accessia-800' : 'text-gray-900'}`}>{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  SIREN {c.siren} · {c.naf_label} · {c.city || c.postal_code} · {c.categorie}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${c.status === 'actif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {c.status}
                </span>
                <p className="text-xs text-gray-400 mt-1">{eligible}/{c.grants.length} aides</p>
              </div>
              <ChevronRight size={15} className={`shrink-0 ${isSelected ? 'text-accessia-500' : 'text-gray-300'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────

export default function RecherchePage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompanySearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<CompanySearchResult | null>(null)
  const [importTarget, setImportTarget] = useState<CompanySearchResult | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setHistory(getHistory()) }, [])

  const doSearch = async (q: string) => {
    if (!q.trim() || q.trim().length < 2) return
    setLoading(true)
    setError('')
    setSearched(true)
    setSelected(null)
    setShowHistory(false)
    try {
      const data = await searchCompany(q.trim())
      setResults(data.results)
      setTotal(data.total)
      if (data.results.length === 1) setSelected(data.results[0])
      addToHistory(q.trim())
      setHistory(getHistory())
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la recherche')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(query)
    if (e.key === 'Escape') setShowHistory(false)
  }

  // Detect if query looks like SIREN/SIRET for hint
  const cleanQ = query.replace(/[\s-]/g, '')
  const isSiren = /^\d{9}$/.test(cleanQ)
  const isSiret = /^\d{14}$/.test(cleanQ)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prospection IA</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Recherchez une entreprise pour estimer ses aides IA disponibles (BPI France, France Num, CIR, OPCO, régionales)
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex gap-3 relative">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              onFocus={() => history.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              placeholder="Nom d'entreprise, SIREN (9 chiffres) ou SIRET (14 chiffres)…"
              className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accessia-300 focus:border-accessia-400 outline-none transition-all"
              autoFocus
            />
            {/* Dropdown historique */}
            {showHistory && history.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 flex items-center gap-1">
                  <Clock size={9} /> Recherches récentes
                </p>
                {history.map(h => (
                  <button
                    key={h}
                    onMouseDown={() => { setQuery(h); doSearch(h) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-accessia-50 transition-colors"
                  >
                    <Clock size={12} className="text-gray-300 shrink-0" />
                    <span className="text-gray-700">{h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => doSearch(query)}
            disabled={loading || query.trim().length < 2}
            className="flex items-center gap-2 bg-accessia-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-accessia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Rechercher
          </button>
        </div>

        <div className="flex items-center justify-between mt-2.5">
          <p className="text-xs text-gray-400">
            Données officielles via{' '}
            <span className="font-medium text-gray-500">recherche-entreprises.api.gouv.fr</span>
            {' '}(INSEE · INPI · BODACC)
          </p>
          {(isSiren || isSiret) && (
            <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded">
              {isSiren ? 'SIREN détecté — recherche exacte' : 'SIRET détecté — recherche exacte'}
            </span>
          )}
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5 flex items-center gap-2">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Chargement */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 size={32} className="animate-spin mb-3" />
          <p className="text-sm">Interrogation du Registre National des Entreprises…</p>
        </div>
      )}

      {/* Aucun résultat */}
      {!loading && searched && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Building2 size={40} className="mb-3 opacity-40" />
          <p className="text-sm">Aucune entreprise trouvée pour « {query} »</p>
          <p className="text-xs mt-1 text-gray-300">Essayez avec le SIREN (9 chiffres) pour une recherche exacte</p>
        </div>
      )}

      {/* Résultats */}
      {!loading && results.length > 0 && (
        <>
          {/* Liste de sélection si plusieurs résultats */}
          {results.length > 1 && (
            <ResultPickList
              results={results}
              total={total}
              selected={selected}
              onSelect={setSelected}
            />
          )}

          {/* Détail de l'entreprise sélectionnée */}
          {selected && (
            <CompanyCard
              company={selected}
              onImport={setImportTarget}
            />
          )}
        </>
      )}

      {/* État initial */}
      {!loading && !searched && (
        <>
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            {[
              { icon: '🏢', title: 'Données officielles', desc: 'INSEE, INPI, BODACC — registre national des entreprises en temps réel' },
              { icon: '💰', title: '7 aides IA calculées', desc: 'BPI France, France Num, CIR, OPCO, régionales — éligibilité automatique' },
              { icon: '🚀', title: 'Import + Diagnostic', desc: 'Créez la fiche client pré-remplie et lancez un diagnostic IA en 1 clic' },
            ].map(card => (
              <div key={card.title} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <div className="text-3xl mb-2">{card.icon}</div>
                <p className="text-sm font-semibold text-gray-800">{card.title}</p>
                <p className="text-xs text-gray-400 mt-1">{card.desc}</p>
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Clock size={11} /> Recherches récentes
              </p>
              <div className="flex flex-wrap gap-2">
                {history.map(h => (
                  <button
                    key={h}
                    onClick={() => { setQuery(h); doSearch(h) }}
                    className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:border-accessia-300 hover:text-accessia-700 transition-colors"
                  >
                    <Clock size={11} className="text-gray-300" />
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal import */}
      {importTarget && (
        <ImportModal
          company={importTarget}
          onClose={() => setImportTarget(null)}
        />
      )}
    </div>
  )
}
