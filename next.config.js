/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server mode (API routes, OAuth, Postgres, Redis). No static export.
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  transpilePackages: ["docx-preview", "pptx-preview", "pdfjs-dist"],
  turbopack: {
    // pptx-preview uses named lodash imports incompatible with CJS lodash under Turbopack.
    resolveAlias: {
      lodash: "lodash-es",
    },
  },
  experimental: {
    proxyClientMaxBodySize: "32mb",
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  // GitHub Pages project site: https://kakaiking.github.io/Internal-App/
  // Drop basePath when moving to dedicated host (see docs/IMPLEMENTATION_PLAN.md).
  basePath: "/Internal-App",
};

module.exports = nextConfig;
