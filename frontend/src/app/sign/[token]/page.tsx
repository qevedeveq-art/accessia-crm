'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { getQuoteForSign, signQuote } from '@/lib/api'
import { CheckCircle2, FileSignature, AlertCircle } from 'lucide-react'

export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [quote, setQuote] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signedBy, setSignedBy] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getQuoteForSign(token)
      .then(setQuote)
      .catch(() => setError('Devis introuvable ou lien invalide.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSign = async () => {
    if (!signedBy.trim() || !agreed) return
    setSubmitting(true)
    try {
      await signQuote(token, signedBy.trim())
      setSuccess(true)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la signature')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Chargement du devis...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-gray-700">{error}</p>
      </div>
    </div>
  )

  if (success || quote?.already_signed) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <CheckCircle2 size={64} className="text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Devis accepté !</h1>
        <p className="text-gray-500">
          {success ? `Signé par ${signedBy}` : `Signé par ${quote?.signed_by}`}
        </p>
        {quote?.signed_at && (
          <p className="text-gray-400 text-sm mt-1">
            le {new Date(quote.signed_at).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <FileSignature size={32} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Signature électronique</h1>
          <p className="text-gray-500 mt-1">ACCESSIA Pro</p>
        </div>

        {/* Quote summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{quote?.title}</h2>
              <p className="text-gray-500 text-sm">{quote?.number} · {quote?.client_name}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{quote?.amount_ttc?.toLocaleString('fr-FR')} €</p>
              <p className="text-gray-400 text-xs">TTC (TVA {quote?.tva_rate}%)</p>
            </div>
          </div>

          {quote?.description && (
            <p className="text-gray-600 text-sm border-t border-gray-100 pt-4">{quote.description}</p>
          )}

          {quote?.items?.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Prestations</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b">
                    <th className="text-left pb-2">Description</th>
                    <th className="text-right pb-2">Qté</th>
                    <th className="text-right pb-2">Prix unit.</th>
                    <th className="text-right pb-2">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2">{item.label}</td>
                      <td className="py-2 text-right">{item.qty}</td>
                      <td className="py-2 text-right">{item.unit_price?.toLocaleString('fr-FR')} €</td>
                      <td className="py-2 text-right font-medium">{(item.qty * item.unit_price).toLocaleString('fr-FR')} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end mt-3 gap-4 text-sm">
                <span className="text-gray-500">HT : {quote?.amount_ht?.toLocaleString('fr-FR')} €</span>
                <span className="font-bold text-gray-900">TTC : {quote?.amount_ttc?.toLocaleString('fr-FR')} €</span>
              </div>
            </div>
          )}

          {quote?.valid_until && (
            <p className="text-gray-400 text-xs mt-4">Valable jusqu'au {new Date(quote.valid_until).toLocaleDateString('fr-FR')}</p>
          )}
        </div>

        {/* Signature form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Signer ce devis</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Votre nom complet *</label>
            <input
              type="text"
              value={signedBy}
              onChange={e => setSignedBy(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-600">
              J'accepte les conditions générales et valide ce devis en signant électroniquement.
              Cette signature a valeur légale.
            </span>
          </label>

          <button
            onClick={handleSign}
            disabled={!signedBy.trim() || !agreed || submitting}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Signature en cours...' : '✅ Accepter et signer le devis'}
          </button>
        </div>
      </div>
    </div>
  )
}
