import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllStones } from '../src/lib/catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');
const BASE_URL = 'https://swamyslabs.vercel.app';

console.log('Generating sitemap...');

const staticPages = [
    { route: '/', changefreq: 'daily', priority: '1.0' },
    { route: '/stones', changefreq: 'weekly', priority: '0.9' },
    { route: '/project-planner', changefreq: 'monthly', priority: '0.8' },
    { route: '/about', changefreq: 'monthly', priority: '0.8' },
    { route: '/contact', changefreq: 'monthly', priority: '0.8' }
];

const productPages = getAllStones().map(stone => {
    return {
        route: `/stones/${stone.slug}`,
        changefreq: 'monthly',
        priority: '0.7',
        stone: stone
    };
});

const allRoutes = [...staticPages, ...productPages];
const today = new Date().toISOString().split('T')[0];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allRoutes.map(item => {
    let imageMarkup = '';
    if (item.stone && item.stone.images && item.stone.images.length > 0) {
        imageMarkup = item.stone.images.map(img => `
    <image:image>
      <image:loc>${BASE_URL}${img}</image:loc>
      <image:title>${item.stone.name.replace(/&/g, '&amp;')}</image:title>
    </image:image>`).join('');
    }
    
    return `  <url>
    <loc>${BASE_URL}${item.route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>${imageMarkup}
  </url>`;
}).join('\n')}
</urlset>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap);
console.log(`Sitemap generated with ${allRoutes.length} URLs at public/sitemap.xml`);
