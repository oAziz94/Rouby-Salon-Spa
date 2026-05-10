import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rouby/api-client", "@rouby/wall-clock"],
};

export default nextConfig;
