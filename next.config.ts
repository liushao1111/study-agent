import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mammoth', 'cheerio'],
  },
}

export default nextConfig
