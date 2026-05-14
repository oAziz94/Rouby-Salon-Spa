import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rouby/api-client", "@rouby/wall-clock"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
