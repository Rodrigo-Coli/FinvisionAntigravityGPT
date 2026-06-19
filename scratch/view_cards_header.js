import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '..', 'backups', 'backup_20260615_banking_unification', 'CreditCards.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('Cartões de Crédito') || line.includes('Novo Cartão') || line.includes('bg-brand-600')) {
    if (idx > 1300 && idx < 1450) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  }
});
