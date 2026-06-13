import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.29.152"],

  turbopack: {
    root: process.cwd(),
  },

  async rewrites() {
  return [
    {
      source: "/api/:path*",
      destination: "https://api.situsrevenue.com/api/:path*",
    },
  ];
},
};

export default nextConfig;
