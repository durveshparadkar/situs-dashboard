import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.29.152"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
