import type { APIRoute } from "astro";
import config from "@/config";

const getRobotsTxt = (sitemapURL: URL) => `
User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = () => {
  const sitemapURL = new URL("sitemap-index.xml", config.site.url);
  return new Response(getRobotsTxt(sitemapURL));
};
