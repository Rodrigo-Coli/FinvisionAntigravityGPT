import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = ['.env', '.env.production', '.env.prod.real'];
for (const f of files) {
    const envPath = path.resolve(__dirname, '../', f);
    if (fs.existsSync(envPath)) {
        console.log(`=== File ${f} exists ===`);
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                console.log(`  Key: "${parts[0].trim()}"`);
            }
        });
    } else {
        console.log(`=== File ${f} does not exist ===`);
    }
}
