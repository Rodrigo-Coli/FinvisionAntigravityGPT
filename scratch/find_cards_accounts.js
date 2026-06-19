import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const searchTerms = ['/accounts', '/cards', '/creditcards', 'Accounts', 'CreditCards'];

const filesToCheck = [
  'App.tsx',
  'components/Nav.tsx',
  'components/BottomNav.tsx',
  'pages/Home.tsx',
  'pages/Reconcile.tsx',
  'pages/History.tsx'
];

filesToCheck.forEach(relPath => {
  const filePath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log(`=== ${relPath} ===`);
  lines.forEach((line, index) => {
    const matched = searchTerms.some(term => line.includes(term));
    if (matched && line.length < 150) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
});
