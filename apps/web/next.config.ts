import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@halcontoro/engine"],
  // Static export for Cloudflare Pages (no Node server needed for MVP).
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
