import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
  'services/finance.service.ts',
  'lib/financialEngine.ts',
  'components/history/AddTransactionModal.tsx'
];

files.forEach(f => {
  const filePath = path.join(__dirname, '..', f);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log(`=== ${f} ===`);
  lines.forEach((line, idx) => {
    if (line.includes('current_balance') || line.includes('update') || line.includes('balance')) {
      if (line.length < 150) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
});
