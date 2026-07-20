import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          // Required for Google Identity Services (GSI) postMessage/popups.
          // Nginx must NOT override with Cross-Origin-Opener-Policy: same-origin
          // (use same-origin-allow-popups or omit the header).
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'noabi.cloud',
      },
      {
        protocol: 'https',
        hostname: 'app.noabi.cloud',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
