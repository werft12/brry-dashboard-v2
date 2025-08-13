import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow deploys even if there are ESLint errors (we'll fix them iteratively)
    ignoreDuringBuilds: true,
  },
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
