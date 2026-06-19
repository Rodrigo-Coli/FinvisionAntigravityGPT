const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git' && file !== '.vercel') {
        searchDir(fullPath);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.sql')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('getUTCDate') || content.includes('Date.UTC') || content.includes('Math.min(targetDay') || content.includes('new Date(year, monthIndex') || content.includes('vencimento') || content.includes('parcela')) {
          console.log(`Found in: ${fullPath}`);
        }
      }
    }
  }
}

searchDir('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main');
