import type { NextConfig } from "next";

const isCapacitor = process.env.BUILD_TARGET === 'capacitor';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-icons', 'date-fns'],
  },
  // Static export for Capacitor builds; SSR for web dev
  ...(isCapacitor && {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
  }),
  // Proxy API requests to NestJS backend (web dev only — not used in Capacitor builds)
  ...(!isCapacitor && {
    // Build orders became Order costing; keep old bookmarks working
    async redirects() {
      return [{ source: '/budget/build-orders/:path*', destination: '/budget/order-costing/:path*', permanent: true }];
    },
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: `${process.env.API_URL || 'http://localhost:5000'}/api/:path*`,
        },
        {
          source: "/health",
          destination: `${process.env.API_URL || 'http://localhost:5000'}/health`,
        },
      ];
    },
  }),
};

export default nextConfig;
