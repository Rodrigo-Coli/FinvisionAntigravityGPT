const fs = require('fs');
const content = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('overviewData =') || line.includes('const overviewData')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
