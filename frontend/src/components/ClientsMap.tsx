'use client'

import { useEffect, useRef, useState } from 'react'
import { Client } from '@/lib/api'
import Link from 'next/link'
import { MapPin, Loader2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

interface GeoClient extends Client {
  lat: number
  lng: number
}

// Geocode via l'API adresse du gouvernement français
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return null
    const json = await res.json()
    const feat = json.features?.[0]
    if (!feat) return null
    const [lng, lat] = feat.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}

const STATUS_COLOR: Record<string, string> = {
  active: '#16a34a',
  prospect: '#d97706',
  inactive: '#9ca3af',
}

// ── Composant carte (chargé dynamiquement, SSR désactivé) ──
export default function ClientsMap({ clients }: { clients: Client[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [geoClients, setGeoClients] = useState<GeoClient[]>([])
  const [loading, setLoading] = useState(true)
  const [geocoded, setGeocoded] = useState(0)
  const [selected, setSelected] = useState<GeoClient | null>(null)

  // Géocodage des clients avec adresse
  useEffect(() => {
    const withAddress = clients.filter(c => c.address)
    if (withAddress.length === 0) { setLoading(false); return }

    let done = 0
    const results: GeoClient[] = []

    const run = async () => {
      for (const c of withAddress) {
        const coords = await geocode(c.address!)
        if (coords) results.push({ ...c, ...coords })
        done++
        setGeocoded(done)
        // Pause pour respecter le rate limit Nominatim (1 req/sec)
        if (done < withAddress.length) await new Promise(r => setTimeout(r, 200))
      }
      setGeoClients(results)
      setLoading(false)
    }
    run()
  }, [clients])

  // Initialisation Leaflet
  useEffect(() => {
    if (loading || !mapRef.current || geoClients.length === 0) return

    import('leaflet').then(L => {
      const Lx = L.default as any
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
        markersRef.current = []
      }

      const center: [number, number] = [46.5, 2.3]
      const map = Lx.map(mapRef.current, { zoomControl: true, attributionControl: false })
      leafletRef.current = map

      Lx.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      const bounds: [number, number][] = []

      geoClients.forEach(c => {
        const color = STATUS_COLOR[c.status] ?? '#6b7280'
        const icon = Lx.divIcon({
          html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })

        const marker = Lx.marker([c.lat, c.lng], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:sans-serif;min-width:140px">
              <strong style="font-size:13px">${c.name}</strong><br/>
              <span style="font-size:11px;color:#6b7280">${c.type.toUpperCase()} · ${c.status}</span><br/>
              <span style="font-size:11px">${c.address}</span>
            </div>`,
            { closeButton: false, maxWidth: 220 }
          )
        marker.on('click', () => setSelected(c))
        markersRef.current.push(marker)
        bounds.push([c.lat, c.lng])
      })

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      } else {
        map.setView(center, 6)
      }
    })

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }
    }
  }, [loading, geoClients])

  const withAddress = clients.filter(c => c.address).length
  const total = clients.length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-accessia-600" />
          <span className="font-semibold text-gray-800 text-sm">Carte des clients</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {loading && withAddress > 0 && (
            <span className="flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" />
              Géocodage {geocoded}/{withAddress}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Actif
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Prospect
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Inactif
          </span>
        </div>
      </div>

      {/* Map container */}
      <div className="relative" style={{ height: 340 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <div className="text-center text-gray-400">
              <Loader2 size={28} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Localisation des clients…</p>
              {withAddress > 0 && <p className="text-xs mt-1">{geocoded}/{withAddress} adresses</p>}
            </div>
          </div>
        )}
        {!loading && geoClients.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <div className="text-center text-gray-400">
              <MapPin size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune adresse disponible</p>
              <p className="text-xs mt-1">Ajoutez une adresse aux clients pour les localiser</p>
            </div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Selected client card */}
      {selected && (
        <div className="flex items-center gap-3 px-5 py-3 bg-accessia-50 border-t border-accessia-100">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: STATUS_COLOR[selected.status] ?? '#6b7280' }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
            <p className="text-xs text-gray-500 truncate">{selected.address}</p>
          </div>
          <Link
            href={`/clients/${selected.id}`}
            className="text-xs text-accessia-600 hover:text-accessia-800 font-medium whitespace-nowrap"
          >
            Voir la fiche →
          </Link>
          <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 ml-1">✕</button>
        </div>
      )}

      {/* Footer stats */}
      <div className="px-5 py-2 bg-gray-50/50 border-t border-gray-100 text-[11px] text-gray-400">
        {geoClients.length} client(s) localisé(s) sur {total} · Source : api-adresse.data.gouv.fr
      </div>
    </div>
  )
}
