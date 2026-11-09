import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Host project settings expect a "dist" output directory (from the earlier Vite desk).
  distDir: "dist",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: [],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
