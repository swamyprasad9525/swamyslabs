import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const SIZE_THRESHOLD_KB = 500; // 500 KB threshold

console.log('\x1b[33m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '      Swamy Slabs Image Optimization Analyzer     ');
console.log('\x1b[33m%s\x1b[0m', '==================================================');

try {
    const files = fs.readdirSync(PUBLIC_DIR);
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
    const largeImages = [];
    let totalSize = 0;

    files.forEach(file => {
        const filePath = path.join(PUBLIC_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (imageExtensions.includes(ext)) {
                const sizeKb = stats.size / 1024;
                totalSize += stats.size;
                
                if (sizeKb > SIZE_THRESHOLD_KB) {
                    largeImages.push({
                        name: file,
                        sizeMb: (sizeKb / 1024).toFixed(2),
                        isCritical: sizeKb > 1000
                    });
                }
            }
        }
    });

    console.log(`Total public image assets size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB\n`);

    if (largeImages.length === 0) {
        console.log('\x1b[32m%s\x1b[0m', '✔ All images are optimized and under 500 KB! Excellent for performance and SEO.');
    } else {
        console.log('\x1b[31m%s\x1b[0m', `⚠️ Found ${largeImages.length} large image assets (> ${SIZE_THRESHOLD_KB} KB) that will slow down page load times:`);
        console.log('----------------------------------------------------------------------');
        console.log('| Image Name                            | Size (MB) | Severity       |');
        console.log('----------------------------------------------------------------------');
        largeImages.forEach(img => {
            const nameCol = img.name.padEnd(37).substring(0, 37);
            const sizeCol = img.sizeMb.padStart(8) + ' MB';
            const severity = img.isCritical ? '\x1b[31mCRITICAL (SEO)\x1b[0m' : '\x1b[33mWARNING\x1b[0m';
            console.log(`| ${nameCol} | ${sizeCol} | ${severity.padEnd(23)} |`);
        });
        console.log('----------------------------------------------------------------------');

        console.log('\n\x1b[1m%s\x1b[0m', 'Recommendations to Optimize:');
        console.log('1. Convert PNG/JPG files to WebP (reduces size by 70-80% without quality loss).');
        console.log('2. Resize huge images down to appropriate dimensions (e.g., maximum width of 1920px for hero images).');
        console.log('3. Use online tools like TinyPNG (https://tinypng.com/) or CLI compressors.');
        console.log('\nTo automate conversion, you can install sharp:');
        console.log('   \x1b[36m%s\x1b[0m', 'npm install -D sharp');
        console.log('And run a conversion script, or compress them before hosting in production.');
    }
} catch (error) {
    console.error('Error scanning public directory:', error.message);
}
console.log('\x1b[33m%s\x1b[0m', '==================================================');
