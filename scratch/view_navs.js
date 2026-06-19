import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

['components/Nav.tsx', 'components/BottomNav.tsx'].forEach(relPath => {
  const filePath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`File does not exist: ${relPath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log(`--- ${relPath} ---`);
  lines.forEach((line, index) => {
    if (line.includes('planning') || line.includes('goals') || line.includes('budget') || line.includes('studies')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
});
