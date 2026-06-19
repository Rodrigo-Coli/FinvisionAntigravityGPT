import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '..', 'components', 'banking', 'AccountsSection.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('handleEditAccount') || line.includes('handleArchiveAccount') || line.includes('navigate(`/history?account=')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
