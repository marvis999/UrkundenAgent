import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Lets the Docker image ship only the modules the app actually imports. */
  output: "standalone",
  /**
   * Dev and production builds must not share one output directory: a production build
   * replaces the dev manifests and the running dev server then fails with ENOENT on
   * .next/static/development. Set NEXT_DIST_DIR to verify a build while dev is running.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /** MuPDF is WebAssembly loaded at runtime; bundling it would break its file lookup. */
  serverExternalPackages: ["mupdf"],
  /**
   * The new-case form carries the first documents with it, and a handful of scans is well
   * over the single megabyte a server action accepts by default.
   */
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
  /**
   * Pin the trace root to this project. Without it Next walks up to the nearest other
   * lockfile -- a checkout inside another repository, a worktree -- and nests the
   * standalone output under that path, where the Dockerfile no longer finds server.js.
   */
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
