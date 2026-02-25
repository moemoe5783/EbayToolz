import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions are stable in Next.js 14, but enabling enhanced features
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
