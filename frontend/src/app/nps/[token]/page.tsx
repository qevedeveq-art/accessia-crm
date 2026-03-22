'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { getNpsSurvey, submitNps } from '@/lib/api'
import { CheckCircle2, Star } from 'lucide-react'

export default function NpsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [survey, setSurvey] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getNpsSurvey(token)
      .then(setSurvey)
      .catch(() => setError('Enquête introuvable.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async () => {
    if (score === null) return
    setSubmitting(true)
    try {
      await submitNps(token, score, comment || undefined)
      setSuccess(true)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de l\'envoi')
    } finally {
      setSubmitting(false)
    }
  }

  const scoreLabel = (s: number) => {
    if (s >= 9) return { text: 'Excellent !', color: 'text-green-600' }
    if (s >= 7) return { text: 'Bien', color: 'text-blue-600' }
    if (s >= 5) return { text: 'Moyen', color: 'text-yellow-600' }
    return { text: 'À améliorer', color: 'text-red-600' }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Chargement...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-700">{error}</p>
    </div>
  )

  if (success || survey?.already_answered) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <CheckCircle2 size={64} className="text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Merci pour votre retour !</h1>
        <p className="text-gray-500">Votre avis nous aide à améliorer nos services.</p>
        {survey?.score != null && (
          <p className="mt-2 text-gray-400">Votre note : {survey.score}/10</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
            <Star size={32} className="text-yellow-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Votre satisfaction</h1>
          <p className="text-gray-500 mt-1">{survey?.project_name} — {survey?.client_name}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <p className="text-center text-gray-700 text-lg mb-6">
            Sur une échelle de 0 à 10, dans quelle mesure recommanderiez-vous ACCESSIA Pro à un collègue ?
          </p>

          <div className="flex gap-1 justify-center mb-3 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => setScore(i)}
                className={`w-10 h-10 rounded-lg text-sm font-semibold transition-all ${
                  score === i
                    ? i >= 9 ? 'bg-green-500 text-white' : i >= 7 ? 'bg-blue-500 text-white' : i >= 5 ? 'bg-yellow-400 text-white' : 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {i}
              </button>
            ))}
          </div>

          <div className="flex justify-between text-xs text-gray-400 mb-6">
            <span>Pas du tout probable</span>
            <span>Très probable</span>
          </div>

          {score !== null && (
            <p className={`text-center font-semibold mb-4 ${scoreLabel(score).color}`}>
              {scoreLabel(score).text} — {score}/10
            </p>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Un commentaire ? (optionnel)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              placeholder="Qu'est-ce qui vous a le plus satisfait ou déçu ?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={score === null || submitting}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Envoi...' : 'Envoyer mon avis'}
          </button>
        </div>
      </div>
    </div>
  )
}
