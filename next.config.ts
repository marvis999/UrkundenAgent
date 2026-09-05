import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Lets the Docker image ship only the modules the app actually imports. */
  output: "standalone",
  /**
   * Dev and production builds must not share one output directory: a production build
   * replaces the dev manifests and the running dev server then fails with ENOENT on
   * .next/static/development. Set NEXT_DIST_DIR to verify a build while dev is running.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
