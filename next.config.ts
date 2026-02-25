import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Disable anonymous usage telemetry
  // (alternatively set NEXT_TELEMETRY_DISABLED=1 in env vars)
  experimental: {
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
