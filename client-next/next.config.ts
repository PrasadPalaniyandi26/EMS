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
      // Orders moved into one page under Business; the old addresses keep working
      return [
        { source: '/budget/build-orders/:path*', destination: '/business/orders/:path*', permanent: true },
        { source: '/budget/order-costing/:path*', destination: '/business/orders/:path*', permanent: true },
        { source: '/budget/order-costing', destination: '/business/orders', permanent: true },
        { source: '/manage/orders', destination: '/business/orders', permanent: true },
        { source: '/manage/projects', destination: '/business/projects', permanent: true },
        { source: '/manage/products', destination: '/business/products', permanent: true },
        { source: '/budget/projects/:path*', destination: '/business/projects/:path*', permanent: true },
        { source: '/budget/projects', destination: '/business/projects', permanent: true },
        { source: '/budget/products/:path*', destination: '/business/products/:path*', permanent: true },
        { source: '/budget/products', destination: '/business/products', permanent: true },
      ];
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
