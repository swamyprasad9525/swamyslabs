import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PREMIUM_STONES } from '../src/data/stones.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');
const BASE_URL = 'https://swamyslabs.com';

console.log('Generating sitemap...');

const pages = [
    '/',
    '/about',
    '/contact',
    '/collection'
];

const productPages = PREMIUM_STONES.map(stone => `/collection/${stone.id}`);

const allRoutes = [...pages, ...productPages];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes.map(route => `
  <url>
    <loc>${BASE_URL}${route}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${route === '/' ? 'daily' : 'weekly'}</changefreq>
    <priority>${route === '/' ? '1.0' : '0.8'}</priority>
  </url>
`).join('')}
</urlset>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap);
console.log(`Sitemap generated with ${allRoutes.length} URLs at public/sitemap.xml`);
