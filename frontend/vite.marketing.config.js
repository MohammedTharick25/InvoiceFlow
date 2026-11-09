import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const marketingDirectory = path.resolve(frontendDirectory, "../marketing");

function searchAssetsPlugin(marketingUrl) {
  const canonicalUrl = new URL(marketingUrl);
  const siteRoot = `${canonicalUrl.origin}${canonicalUrl.pathname.replace(/\/$/, "")}`;
  return {
    name: "invoiceflow-marketing-search-assets",
    transformIndexHtml(html) {
      return html
        .replaceAll(
          'content="/og-image.svg"',
          `content="${siteRoot}/og-image.svg"`,
        )
        .replace(
          "</head>",
          `    <link rel="canonical" href="${siteRoot}/" />\n    <meta property="og:url" content="${siteRoot}/" />\n</head>`,
        );
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteRoot}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url></urlset>\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\nSitemap: ${siteRoot}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, marketingDirectory, "VITE_");
  const marketingUrl = env.VITE_MARKETING_URL || "https://invoiceflow.example";
  return {
    root: marketingDirectory,
    plugins: [react(), tailwindcss(), searchAssetsPlugin(marketingUrl)],
    resolve: {
      alias: [
        {
          find: "tailwindcss",
          replacement: path.resolve(
            frontendDirectory,
            "node_modules/tailwindcss",
          ),
        },
        {
          find: "react-dom/client",
          replacement: path.resolve(
            frontendDirectory,
            "node_modules/react-dom/client.js",
          ),
        },
        {
          find: "react",
          replacement: path.resolve(frontendDirectory, "node_modules/react"),
        },
      ],
    },
    build: { outDir: "dist", emptyOutDir: true },
    server: { fs: { allow: [".."] } },
  };
});
