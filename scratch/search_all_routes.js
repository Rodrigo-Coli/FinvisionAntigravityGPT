import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dirsToSearch = ['pages', 'components'];
const searchPatterns = ['/cards', '/accounts'];

function scanDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        searchPatterns.forEach(pat => {
          if (line.includes(`'${pat}'`) || line.includes(`"${pat}"`) || line.includes(`\`${pat}\``)) {
            const relPath = path.relative(path.join(__dirname, '..'), fullPath);
            console.log(`[FOUND] ${relPath}:${index + 1}: ${line.trim()}`);
          }
        });
      });
    }
  });
}

dirsToSearch.forEach(d => {
  const fullPath = path.join(__dirname, '..', d);
  if (fs.existsSync(fullPath)) {
    scanDir(fullPath);
  }
});
