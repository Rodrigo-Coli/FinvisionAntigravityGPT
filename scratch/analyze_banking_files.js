import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function analyze(relPath) {
  const filePath = path.join(__dirname, '..', relPath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`\n=============================================`);
  console.log(`FILE: ${relPath}`);
  console.log(`Lines: ${lines.length}`);
  console.log(`=============================================`);

  console.log('--- Imports (first 15 lines) ---');
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    console.log(lines[i]);
  }

  console.log('\n--- State and Handlers ---');
  lines.forEach((line, idx) => {
    if (line.includes('useState') || line.includes('useEffect') || line.includes('const handle') || line.includes('async function') || line.includes('const fetch')) {
      if (line.length < 150) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

analyze('pages/Accounts.tsx');
analyze('pages/CreditCards.tsx');
