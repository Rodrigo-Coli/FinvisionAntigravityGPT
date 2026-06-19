import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '..', 'pages', 'CreditCards.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let returnLineIdx = -1;
lines.forEach((line, idx) => {
  if (line.includes('return (') && returnLineIdx === -1 && idx > 1200) {
    returnLineIdx = idx;
  }
});

console.log(`return starts at line ${returnLineIdx + 1}`);
for (let i = returnLineIdx; i < Math.min(returnLineIdx + 200, lines.length); i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
