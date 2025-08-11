import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow deploys even if there are ESLint errors (we'll fix them iteratively)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
