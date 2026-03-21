import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Using standalone output for smaller Docker builds
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        // Rewrite to backend URL in development if not using docker-compose
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/:path*` 
          : 'http://localhost:8000/api/v1/:path*',
      },
    ]
  },
}

export default nextConfig
