const fs = require('fs');

function checkFile(filePath, keywords) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    keywords.forEach(kw => {
      if (line.includes(kw)) {
        console.log(`${filePath}:${index + 1}: ${line.trim()}`);
      }
    });
  });
}

const keywords = ['Date.UTC', 'getUTCDate', 'setUTCMonth', 'Math.min(targetDay'];
checkFile('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/CreditCards.tsx', keywords);
checkFile('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Settings.tsx', keywords);
checkFile('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Studies.tsx', keywords);
checkFile('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/services/finance.service.ts', keywords);
