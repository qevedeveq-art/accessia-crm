/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Proxy /api/* → backend port 8000 (s'applique uniquement aux URL relatives,
    // donc sans effet en Docker où NEXT_PUBLIC_API_URL est une URL absolue)
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
}
module.exports = nextConfig
