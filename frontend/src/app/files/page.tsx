'use client'

import { useEffect, useState, Suspense } from 'react'
import { browseRoot, browseDir, readFile, FileItem } from '@/lib/api'
import { Folder, File, FileText, ChevronRight, Home, Eye, ArrowLeft } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

function FileIcon({ ext, isDir }: { ext?: string | null; isDir: boolean }) {
  if (isDir) return <Folder size={16} className="text-amber-500 shrink-0" />
  if (ext === '.md' || ext === '.txt') return <FileText size={16} className="text-sensia-500 shrink-0" />
  return <File size={16} className="text-gray-400 shrink-0" />
}

function fmtSize(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

function FilesPageInner() {
  const searchParams = useSearchParams()
  const initPath = searchParams.get('path')

  const [items, setItems] = useState<FileItem[]>([])
  const [path, setPath] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [content, setContent] = useState<{ path: string; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const navigate = async (target: string | null) => {
    setLoading(true)
    setError('')
    setContent(null)
    try {
      const data = target ? await browseDir(target) : await browseRoot()
      setItems(data)
      if (target && target !== path) {
        if (path) setHistory(h => [...h, path])
        setPath(target)
      } else if (!target) {
        setHistory([])
        setPath(null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const back = () => {
    const prev = history[history.length - 1] ?? null
    setHistory(h => h.slice(0, -1))
    setPath(prev)
    setContent(null)
    if (prev) browseDir(prev).then(setItems).catch(() => {})
    else browseRoot().then(setItems).catch(() => {})
  }

  const openFile = async (item: FileItem) => {
    if (!item.is_dir) {
      if (item.extension === '.md' || item.extension === '.txt' || !item.extension) {
        try {
          const data = await readFile(item.path)
          setContent({ path: item.name, text: data.content })
        } catch (e: any) {
          setError(e.message)
        }
      }
    } else {
      navigate(item.path)
    }
  }

  useEffect(() => {
    if (initPath) {
      navigate(initPath)
    } else {
      navigate(null)
    }
  }, [])

  // Breadcrumb from path
  const rootLabel = 'SENSIA DVZ'
  const crumbs = path
    ? [rootLabel, ...path.split(/[\\/]/).slice(-3)]
    : [rootLabel]

  return (
    <div className="p-6 h-[calc(100vh-0px)]">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Explorateur de fichiers</h1>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-gray-400 mb-4 overflow-x-auto">
        <button onClick={() => navigate(null)} className="flex items-center gap-1 hover:text-gray-700">
          <Home size={13} /> {rootLabel}
        </button>
        {crumbs.slice(1).map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <span className="text-gray-600">{c}</span>
          </span>
        ))}
      </div>

      <div className="flex gap-4 h-[calc(100vh-180px)]">
        {/* Explorateur */}
        <div className="w-80 bg-white rounded-xl border border-gray-100 shadow-sm overflow-y-auto flex flex-col">
          {history.length > 0 && (
            <button onClick={back} className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-b border-gray-100">
              <ArrowLeft size={14} /> Dossier parent
            </button>
          )}
          {loading && <div className="p-4 text-gray-400 text-sm animate-pulse">Chargement…</div>}
          {error && <div className="p-4 text-red-500 text-sm">{error}</div>}
          {!loading && items.map(item => (
            <button
              key={item.path}
              onClick={() => openFile(item)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0 group"
            >
              <FileIcon ext={item.extension} isDir={item.is_dir} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{item.name}</p>
                {!item.is_dir && item.size != null && (
                  <p className="text-[10px] text-gray-400">{fmtSize(item.size)}</p>
                )}
              </div>
              {!item.is_dir && (item.extension === '.md' || item.extension === '.txt') && (
                <Eye size={12} className="shrink-0 text-gray-300 group-hover:text-sensia-400" />
              )}
              {item.is_dir && <ChevronRight size={12} className="shrink-0 text-gray-300" />}
            </button>
          ))}
        </div>

        {/* Visionneuse */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-y-auto">
          {!content ? (
            <div className="flex items-center justify-center h-full text-gray-300">
              <div className="text-center">
                <FileText size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Cliquez sur un fichier .md ou .txt pour le prévisualiser</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-xs font-mono text-gray-400 mb-4 pb-3 border-b border-gray-100">{content.path}</p>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">{content.text}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FilesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 animate-pulse">Chargement…</div>}>
      <FilesPageInner />
    </Suspense>
  )
}
