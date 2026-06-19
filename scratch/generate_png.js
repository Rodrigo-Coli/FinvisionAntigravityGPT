import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public/logo.svg');
const pngPath = path.resolve('public/logo.png');
const png192Path = path.resolve('public/logo-192.png');
const icoPath = path.resolve('public/favicon.ico');

async function main() {
    console.log('Generating PNG and ICO from SVG...');
    
    // Generate 512x512 logo.png
    await sharp(svgPath)
        .resize(512, 512)
        .png()
        .toFile(pngPath);
    console.log('Generated public/logo.png (512x512)');

    // Generate 192x192 logo-192.png
    await sharp(svgPath)
        .resize(192, 192)
        .png()
        .toFile(png192Path);
    console.log('Generated public/logo-192.png (192x192)');

    // Generate 32x32 favicon.ico (as a PNG, which modern browsers support)
    await sharp(svgPath)
        .resize(32, 32)
        .png()
        .toFile(icoPath);
    console.log('Generated public/favicon.ico (32x32 PNG)');
}

main().catch(err => {
    console.error('Error generating assets:', err);
    process.exit(1);
});
