import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@goaround/agent-core"],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@goaround/agent-core": path.resolve(currentDir, "../../packages/agent-core/src/index.ts")
    };
    return config;
  }
};

export default nextConfig;
