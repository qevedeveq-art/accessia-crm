'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, AlertCircle } from 'lucide-react'
import { login, setAuthToken, getAuthToken, getAuthStatus } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Si auth désactivée ou token valide → redirect home
    getAuthStatus()
      .then(s => {
        if (!s.auth_enabled) { router.replace('/'); return }
        const token = getAuthToken()
        if (token) { router.replace('/'); return }
        setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true); setError('')
    try {
      const res = await login(password)
      setAuthToken(res.access_token)
      router.replace('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={32} className="animate-spin text-accessia-600" />
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accessia-50 to-white p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-accessia-600 rounded-xl flex items-center justify-center mb-3">
            <Lock size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">ACCESSIA Pro</h1>
          <p className="text-sm text-gray-400 mt-1">Entrez votre mot de passe pour continuer</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accessia-300 focus:border-accessia-400 transition-all"
            autoFocus
          />
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-accessia-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-accessia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Connexion…</> : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
