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
      {
        protocol: 'https',
        hostname: 'readyset.co',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin', '@google-cloud/storage', 'fluent-ffmpeg', 'ffmpeg-static', '@ffmpeg-installer/ffmpeg'],
    outputFileTracingIncludes: {
      '/api/assets/*/generate-sprite': [
        './node_modules/ffmpeg-static/**',
        './node_modules/@ffmpeg-installer/**',
      ],
    },
  },
};

export default nextConfig;
