import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '..', 'pages', 'Assets.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Total lines: ${lines.length}`);

lines.forEach((line, index) => {
  if (line.includes('Bloco') || line.includes('activeView === \'overview\'') || line.includes('overviewData')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
