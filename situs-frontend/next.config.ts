import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://situs-dashboard-2.onrender.com/api/:path*",
      },
    ];
  },
};

export default nextConfig;
