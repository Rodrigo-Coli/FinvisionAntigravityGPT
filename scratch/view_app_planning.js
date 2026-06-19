import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '..', 'App.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('planning') || line.includes('Planning') || line.includes('budget') || line.includes('goals') || line.includes('studies')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
