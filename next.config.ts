import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "europepmc.org" },
      { protocol: "https", hostname: "www.ncbi.nlm.nih.gov" },
      { protocol: "https", hostname: "cdn.ncbi.nlm.nih.gov" },
    ],
  },
};

export default nextConfig;
