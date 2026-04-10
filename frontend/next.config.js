/** @type {import('next').NextConfig} */
const nextConfig = {

  // Mode standalone : image Docker allégée, démarrage plus rapide
  output: 'standalone',

  // Compression gzip native → réduit la bande passante
  compress: true,

  // Désactive le header X-Powered-By (sécurité)
  poweredByHeader: false,

  // Optimisation des images (lazy loading automatique)
  images: {
    // L'application packagée macOS tourne en mode standalone sans dépendre de sharp.
    unoptimized: true,
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 3600,
  },

  // Proxy /api/* → backend port 8000
  // (s'applique uniquement en dev local — ignoré en Docker)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },

  // Headers de sécurité et cache
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Cache agressif pour les assets statiques (JS/CSS/images)
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },

  // Webpack : optimisations pour la build ARM64
  webpack: (config, { isServer }) => {
    // Reduce bundle size en prod
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
    }
    return config
  },
}

module.exports = nextConfig
