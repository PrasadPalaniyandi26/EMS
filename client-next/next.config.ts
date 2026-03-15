import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-icons', 'date-fns'],
  },
  // Proxy API requests to NestJS backend
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
};

export default nextConfig;
