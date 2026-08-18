import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@spelsajt/contracts", "@spelsajt/system-model"],
};

export default nextConfig;
