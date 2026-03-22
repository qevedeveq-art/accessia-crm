'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { globalSearch, SearchResults } from '@/lib/api'
import { Search, X, Users, FolderKanban, FileText, CheckSquare } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Open on Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults(null)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) { setResults(null); return }
    const timer = setTimeout(() => {
      setLoading(true)
      globalSearch(query)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const close = useCallback(() => setOpen(false), [])

  if (!open) return null

  const hasResults = results && (
    results.clients.length + results.projects.length +
    results.quotes.length + results.tasks.length > 0
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      onClick={close}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200"
        onClick={e => e.stopPropagation()}>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher clients, projets, devis, tâches..."
            className="flex-1 text-sm outline-none text-gray-900 placeholder-gray-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-gray-100 rounded">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">Recherche...</div>
          )}

          {!loading && query.length >= 2 && !hasResults && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">Aucun résultat pour &quot;{query}&quot;</div>
          )}

          {!loading && hasResults && results && (
            <div className="py-2">
              {results.clients.length > 0 && (
                <Section icon={<Users size={14} />} title="Clients">
                  {results.clients.map(c => (
                    <ResultItem key={c.id} href={`/clients/${c.id}`} onClose={close}
                      primary={c.name} secondary={c.sector} badge={c.status} />
                  ))}
                </Section>
              )}
              {results.projects.length > 0 && (
                <Section icon={<FolderKanban size={14} />} title="Projets">
                  {results.projects.map(p => (
                    <ResultItem key={p.id} href={`/projects/${p.id}`} onClose={close}
                      primary={p.name} secondary={`${p.code} · ${p.client_name}`} />
                  ))}
                </Section>
              )}
              {results.quotes.length > 0 && (
                <Section icon={<FileText size={14} />} title="Devis">
                  {results.quotes.map(q => (
                    <ResultItem key={q.id} href={`/devis`} onClose={close}
                      primary={q.title} secondary={`${q.number} · ${q.client_name}`} badge={q.status} />
                  ))}
                </Section>
              )}
              {results.tasks.length > 0 && (
                <Section icon={<CheckSquare size={14} />} title="Tâches">
                  {results.tasks.map(t => (
                    <ResultItem key={t.id} href={`/`} onClose={close}
                      primary={t.title} secondary={t.status} badge={t.priority} />
                  ))}
                </Section>
              )}
            </div>
          )}

          {!query && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Tapez au moins 2 caractères pour rechercher
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

function ResultItem({ href, primary, secondary, badge, onClose }: {
  href: string; primary: string; secondary?: string; badge?: string; onClose: () => void
}) {
  return (
    <Link href={href} onClick={onClose}
      className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-900">{primary}</p>
        {secondary && <p className="text-xs text-gray-400">{secondary}</p>}
      </div>
      {badge && (
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{badge}</span>
      )}
    </Link>
  )
}
