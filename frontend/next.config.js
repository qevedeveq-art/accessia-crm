/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // En dev local (NEXT_PUBLIC_API_URL vide) → proxy /api/* vers le backend port 8000
    // En Docker (NEXT_PUBLIC_API_URL=http://localhost:8001) → l'appel est absolu, pas de proxy
    if (process.env.NEXT_PUBLIC_API_URL) return []
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
}
module.exports = nextConfig
