/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server mode (API routes, OAuth, Postgres, Redis). No static export.
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // GitHub Pages project site: https://kakaiking.github.io/Internal-App/
  // Drop basePath when moving to dedicated host (see docs/IMPLEMENTATION_PLAN.md).
  basePath: "/Internal-App",
};

module.exports = nextConfig;
