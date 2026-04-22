/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
      preventFullImport: true,
    },
  },
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin', '@google-cloud/storage', 'fluent-ffmpeg', 'ffmpeg-static', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
    outputFileTracingIncludes: {
      '/api/assets/*/generate-sprite': [
        './node_modules/ffmpeg-static/**',
        './node_modules/@ffmpeg-installer/**',
      ],
      '/api/assets/*/probe': [
        './node_modules/@ffmpeg-installer/**',
        './node_modules/ffmpeg-static/**',
        './node_modules/@ffprobe-installer/**',
      ],
      '/api/exports': [
        './node_modules/ffmpeg-static/**',
        './node_modules/@ffmpeg-installer/**',
      ],
      '/api/exports/*': [
        './node_modules/ffmpeg-static/**',
        './node_modules/@ffmpeg-installer/**',
      ],
    },
  },
};

export default nextConfig;
